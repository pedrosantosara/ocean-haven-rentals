package main

import (
    "context"
    "encoding/json"
    "errors"
    "io"
    "log"
    "net/http"
    "net/url"
    "os"
    "regexp"
    "strings"
    "time"
    "fmt"
    "github.com/golang-jwt/jwt/v5"
    "github.com/gorilla/mux"
    "github.com/gorilla/websocket"
    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/joho/godotenv"
    "golang.org/x/crypto/bcrypt"
    emailpkg "ocean-haven-rentals/internal/email"
)

type Server struct {
    pool *pgxpool.Pool
    jwtSecret string
    hub *Hub
    icsCache string
    icsLastUpdated time.Time
    stripeSecret string
    stripePublic string
    email *emailpkg.EmailService
}

func jsonResp(w http.ResponseWriter, code int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(code)
    _ = json.NewEncoder(w).Encode(v)
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        hdr := r.Header.Get("Authorization")
        if !strings.HasPrefix(hdr, "Bearer ") {
            jsonResp(w, http.StatusUnauthorized, map[string]string{"error":"unauthorized"})
            return
        }
        tokenStr := strings.TrimPrefix(hdr, "Bearer ")
        tkn, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) { return []byte(s.jwtSecret), nil })
        if err != nil || !tkn.Valid {
            jsonResp(w, http.StatusUnauthorized, map[string]string{"error":"invalid_token"})
            return
        }
        claims, ok := tkn.Claims.(jwt.MapClaims)
        if !ok {
            jsonResp(w, http.StatusUnauthorized, map[string]string{"error":"invalid_token"})
            return
        }
        ctx := context.WithValue(r.Context(), "user", claims)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
    var body struct{ Email, Password, FullName string; IsOwner bool }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.Email == "" || body.Password == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    hash, _ := bcrypt.GenerateFromPassword([]byte(body.Password), 10)
    _, err := s.pool.Exec(r.Context(), "INSERT INTO users (email, password_hash, full_name, is_owner) VALUES ($1,$2,$3,$4)", body.Email, string(hash), body.FullName, body.IsOwner)
    if err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"email": body.Email, "is_owner": body.IsOwner, "exp": time.Now().Add(7*24*time.Hour).Unix()})
    str, _ := token.SignedString([]byte(s.jwtSecret))
    if s.email != nil {
        link := "https://localhost:3000/verify?email=" + url.QueryEscape(body.Email)
        _ = s.email.SendAccountConfirmationEmail(body.Email, emailpkg.AccountConfirmationData{ Name: body.FullName, VerificationLink: link })
    }
    jsonResp(w, 200, map[string]string{"token": str})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
    var body struct{ Email, Password string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    var email string; var hash string; var isOwner bool
    err := s.pool.QueryRow(r.Context(), "SELECT email, password_hash, is_owner FROM users WHERE email=$1", body.Email).Scan(&email, &hash, &isOwner)
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) { jsonResp(w, 401, map[string]string{"error":"invalid_credentials"}); return }
        jsonResp(w, 500, map[string]string{"error": err.Error()}); return
    }
    if bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil { jsonResp(w, 401, map[string]string{"error":"invalid_credentials"}); return }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"email": email, "is_owner": isOwner, "exp": time.Now().Add(7*24*time.Hour).Unix()})
    str, _ := token.SignedString([]byte(s.jwtSecret))
    jsonResp(w, 200, map[string]string{"token": str})
}

func getClaims(r *http.Request) jwt.MapClaims {
    v := r.Context().Value("user")
    if v == nil { return jwt.MapClaims{} }
    return v.(jwt.MapClaims)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var fullName string; var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(full_name,'') AS full_name, COALESCE(is_owner,false) AS is_owner FROM users WHERE email=$1", c["email"]).Scan(&fullName, &isOwner)
    jsonResp(w, 200, map[string]any{"user": map[string]any{"email": c["email"], "full_name": fullName, "is_owner": isOwner}})
}

func (s *Server) handleAddIcal(w http.ResponseWriter, r *http.Request) {
    var body struct{ Platform, Url string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.Platform == "" || body.Url == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    if _, err := s.pool.Exec(r.Context(), "INSERT INTO icals (platform, url) VALUES ($1,$2)", body.Platform, body.Url); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleListIcal(w http.ResponseWriter, r *http.Request) {
    rows, err := s.pool.Query(r.Context(), "SELECT id, platform, url, COALESCE(created_at, now()) AS created_at, last_sync FROM icals ORDER BY created_at DESC")
    if err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    type rec struct{ ID int64 `json:"id"`; Platform string `json:"platform"`; Url string `json:"url"`; CreatedAt time.Time `json:"created_at"`; LastSync *time.Time `json:"last_sync,omitempty"` }
    var out []rec
    for rows.Next() { var a rec; if err := rows.Scan(&a.ID,&a.Platform,&a.Url,&a.CreatedAt,&a.LastSync); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return } ; out = append(out,a) }
    if rows.Err() != nil { jsonResp(w, 500, map[string]string{"error": rows.Err().Error()}); return }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleDeleteIcal(w http.ResponseWriter, r *http.Request) {
    id := mux.Vars(r)["id"]
    if _, err := s.pool.Exec(r.Context(), "DELETE FROM icals WHERE id=$1", id); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleMergedICS(w http.ResponseWriter, r *http.Request) {
    if s.icsCache == "" || time.Since(s.icsLastUpdated) > 10*time.Minute {
        s.refreshMergedICS(r.Context())
    }
    w.Header().Set("Content-Type", "text/calendar")
    w.Header().Set("X-ICS-Last-Updated", s.icsLastUpdated.Format(time.RFC3339))
    _, _ = w.Write([]byte(s.icsCache))
}

func extractEventsFromICS(s string) []string {
    re := regexp.MustCompile(`(?s)BEGIN:VEVENT.*?END:VEVENT\s*`)
    return re.FindAllString(s, -1)
}

func extractEventsFromICSWithCategory(s, category string) []string {
    re := regexp.MustCompile(`(?s)BEGIN:VEVENT.*?END:VEVENT\s*`)
    events := re.FindAllString(s, -1)
    var out []string
    for _, e := range events {
        out = append(out, strings.Replace(e, "BEGIN:VEVENT\n", "BEGIN:VEVENT\nCATEGORIES:"+category+"\n", 1))
    }
    return out
}

func (s *Server) refreshMergedICS(ctx context.Context) {
    var vevents []string
    rows, err := s.pool.Query(ctx, "SELECT id, platform, url FROM icals")
    if err != nil { return }
    for rows.Next() {
        var rid int64; var platform, u string
        if err := rows.Scan(&rid, &platform, &u); err != nil { return }
        resp, err := http.Get(u)
        if err != nil { continue }
        body, err := io.ReadAll(resp.Body)
        resp.Body.Close()
        if err != nil { continue }
        evs := extractEventsFromICSWithCategory(string(body), platform)
        vevents = append(vevents, evs...)
        _, _ = s.pool.Exec(ctx, "UPDATE icals SET last_sync=now() WHERE id=$1", rid)
    }
    bl, err := s.pool.Query(ctx, "SELECT id, from_ts, to_ts, COALESCE(note,'') AS note FROM blocks")
    if err != nil { return }
    for bl.Next() {
        var id int64; var from, to time.Time; var note string
        if err := bl.Scan(&id, &from, &to, &note); err != nil { return }
        var sb strings.Builder
        sb.WriteString("BEGIN:VEVENT\n")
        sb.WriteString("UID:block-" + time.UnixMilli(time.Now().UnixMilli()).Format("20060102150405") + "-" + time.Now().Format("150405") + "\n")
        sb.WriteString("SUMMARY:" + func() string { if note != "" { return note } ; return "Bloqueio" }() + "\n")
        sb.WriteString("CATEGORIES:Block\n")
        sb.WriteString("DTSTART:" + from.UTC().Format("20060102T150405Z") + "\n")
        sb.WriteString("DTEND:" + to.UTC().Format("20060102T150405Z") + "\n")
        sb.WriteString("STATUS:CONFIRMED\n")
        sb.WriteString("END:VEVENT\n")
        vevents = append(vevents, sb.String())
    }
    bro, err := s.pool.Query(ctx, "SELECT id, COALESCE(guest_name,'') AS guest_name, check_in, check_out, COALESCE(status,'requested') AS status FROM bookings")
    if err != nil { return }
    for bro.Next() {
        var id, guest, status string; var ci, co time.Time
        if err := bro.Scan(&id,&guest,&ci,&co,&status); err != nil { return }
        if status == "rejected" { continue }
        var sb strings.Builder
        sb.WriteString("BEGIN:VEVENT\n")
        sb.WriteString("UID:" + id + "\n")
        sb.WriteString("SUMMARY:Reserva " + guest + "\n")
        sb.WriteString("CATEGORIES:Site\n")
        sb.WriteString("DTSTART:" + ci.UTC().Format("20060102T150405Z") + "\n")
        sb.WriteString("DTEND:" + co.UTC().Format("20060102T150405Z") + "\n")
        if status == "approved" { sb.WriteString("STATUS:CONFIRMED\n") } else { sb.WriteString("STATUS:TENTATIVE\n") }
        sb.WriteString("END:VEVENT\n")
        vevents = append(vevents, sb.String())
    }
    var b strings.Builder
    b.WriteString("BEGIN:VCALENDAR\n")
    b.WriteString("VERSION:2.0\n")
    b.WriteString("PRODID:-//ocean-haven//Merged Calendar//EN\n")
    for _, e := range vevents { b.WriteString(e) }
    b.WriteString("END:VCALENDAR\n")
    s.icsCache = b.String()
    s.icsLastUpdated = time.Now()
}

func (s *Server) handleSyncIcal(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    s.refreshMergedICS(r.Context())
    jsonResp(w, 200, map[string]any{"last_updated": s.icsLastUpdated.Format(time.RFC3339)})
}

func (s *Server) handleLastSync(w http.ResponseWriter, r *http.Request) {
    var ts time.Time
    _ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(MAX(last_sync), now()) FROM icals").Scan(&ts)
    jsonResp(w, 200, map[string]any{"last_updated": ts.Format(time.RFC3339)})
}

func (s *Server) handleCreateBooking(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var body struct{ CheckIn, CheckOut string; GuestName, GuestEmail, GuestPhone string; NumberOfGuests int; SubtotalPrice float64; DiscountAmount float64; TotalPrice float64 }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.CheckIn == "" || body.CheckOut == "" || body.GuestName == "" || body.GuestEmail == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    if _, err := s.pool.Exec(r.Context(), "INSERT INTO bookings (user_email,status,check_in,check_out,guest_name,guest_email,guest_phone,number_of_guests,subtotal_price,discount_amount,total_price) VALUES ($1,'requested',$2,$3,$4,$5,$6,$7,$8,$9,$10)", c["email"], body.CheckIn, body.CheckOut, body.GuestName, body.GuestEmail, body.GuestPhone, body.NumberOfGuests, body.SubtotalPrice, body.DiscountAmount, body.TotalPrice); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    jsonResp(w, 200, map[string]string{"status":"requested"})
}

func (s *Server) handleListBookingsOwner(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    rows, err := s.pool.Query(r.Context(), "SELECT id, COALESCE(user_email,'') AS user_email, COALESCE(status,'requested') AS status, check_in, check_out, COALESCE(guest_name,'') AS guest_name, COALESCE(guest_email,'') AS guest_email, COALESCE(guest_phone,'') AS guest_phone, number_of_guests, COALESCE(subtotal_price,0)::float8 AS subtotal_price, COALESCE(discount_amount,0)::float8 AS discount_amount, COALESCE(total_price,0)::float8 AS total_price, COALESCE(created_at, now()) AS created_at FROM bookings ORDER BY created_at DESC")
    if err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    type rec struct{ ID string; UserEmail string; Status string; CheckIn time.Time; CheckOut time.Time; GuestName string; GuestEmail string; GuestPhone string; NumberOfGuests int; SubtotalPrice float64; DiscountAmount float64; TotalPrice float64; CreatedAt time.Time }
    var out []rec
    for rows.Next() { var a rec; if err := rows.Scan(&a.ID,&a.UserEmail,&a.Status,&a.CheckIn,&a.CheckOut,&a.GuestName,&a.GuestEmail,&a.GuestPhone,&a.NumberOfGuests,&a.SubtotalPrice,&a.DiscountAmount,&a.TotalPrice,&a.CreatedAt); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return } ; out = append(out,a) }
    if rows.Err() != nil { jsonResp(w, 500, map[string]string{"error": rows.Err().Error()}); return }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleListBookingsMine(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    rows, err := s.pool.Query(r.Context(), "SELECT id, COALESCE(status,'requested') AS status, check_in, check_out, COALESCE(guest_name,'') AS guest_name, number_of_guests, COALESCE(subtotal_price,0)::float8 AS subtotal_price, COALESCE(discount_amount,0)::float8 AS discount_amount, COALESCE(total_price,0)::float8 AS total_price, COALESCE(created_at, now()) AS created_at FROM bookings WHERE user_email=$1 ORDER BY created_at DESC", c["email"])
    if err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    type rec struct{ ID string; Status string; CheckIn time.Time; CheckOut time.Time; GuestName string; NumberOfGuests int; SubtotalPrice float64; DiscountAmount float64; TotalPrice float64; CreatedAt time.Time }
    var out []rec
    for rows.Next() { var a rec; if err := rows.Scan(&a.ID,&a.Status,&a.CheckIn,&a.CheckOut,&a.GuestName,&a.NumberOfGuests,&a.SubtotalPrice,&a.DiscountAmount,&a.TotalPrice,&a.CreatedAt); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return } ; out = append(out,a) }
    if rows.Err() != nil { jsonResp(w, 500, map[string]string{"error": rows.Err().Error()}); return }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleApprove(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    id := mux.Vars(r)["id"]
    if _, err := s.pool.Exec(r.Context(), "UPDATE bookings SET status='approved', updated_at=now() WHERE id=$1", id); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    var guestName, guestEmail string
    var ci, co time.Time
    var guests int
    var total float64
    _ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(guest_name,''), COALESCE(guest_email,''), check_in, check_out, COALESCE(number_of_guests,0), COALESCE(total_price,0)::float8 FROM bookings WHERE id=$1", id).Scan(&guestName, &guestEmail, &ci, &co, &guests, &total)
    if s.email != nil {
        _ = s.email.SendBookingAcceptedEmail(guestEmail, emailpkg.BookingEmailData{ Name: guestName, CheckIn: ci.Format("2006-01-02"), CheckOut: co.Format("2006-01-02"), Guests: guests, TotalPrice: total })
    }
    jsonResp(w, 200, map[string]string{"status":"approved"})
}

func (s *Server) handleReject(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    id := mux.Vars(r)["id"]
    if _, err := s.pool.Exec(r.Context(), "UPDATE bookings SET status='rejected', updated_at=now() WHERE id=$1", id); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    jsonResp(w, 200, map[string]string{"status":"rejected"})
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var body struct{ BookingID, Message string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.BookingID == "" || body.Message == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    var isOwner bool
    if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if _, err := s.pool.Exec(r.Context(), "INSERT INTO messages (booking_id, sender_email, is_from_owner, message) VALUES ($1,$2,$3,$4)", body.BookingID, c["email"], isOwner, body.Message); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if s.email != nil {
        var userEmail, guestEmail string
        _ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(user_email,''), COALESCE(guest_email,'') FROM bookings WHERE id=$1", body.BookingID).Scan(&userEmail, &guestEmail)
        var to string
        if isOwner { to = userEmail } else {
            var owner string
            _ = s.pool.QueryRow(r.Context(), "SELECT email FROM users WHERE is_owner=true ORDER BY created_at ASC LIMIT 1").Scan(&owner)
            if owner != "" { to = owner } else { to = guestEmail }
        }
        _ = s.email.SendChatNotificationEmail(to, emailpkg.ChatMessageEmailData{ SenderName: fmt.Sprintf("%v", c["email"]), Message: body.Message, Timestamp: time.Now().Format(time.RFC3339) })
    }
    payload, _ := json.Marshal(map[string]any{"type":"message","data": map[string]any{"booking_id": body.BookingID, "sender_email": c["email"], "is_from_owner": isOwner, "message": body.Message, "created_at": time.Now().Format(time.RFC3339)}})
    s.hub.Broadcast(body.BookingID, payload)
    jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleGetMessages(w http.ResponseWriter, r *http.Request) {
    bookingID := r.URL.Query().Get("booking_id")
    rows, err := s.pool.Query(r.Context(), "SELECT id, booking_id, sender_email, is_from_owner, message, created_at FROM messages WHERE booking_id=$1 ORDER BY created_at ASC", bookingID)
    if err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    type rec struct{ ID int64; BookingID string; SenderEmail string; IsFromOwner bool; Message string; CreatedAt time.Time }
    var out []rec
    for rows.Next() { var a rec; if err := rows.Scan(&a.ID,&a.BookingID,&a.SenderEmail,&a.IsFromOwner,&a.Message,&a.CreatedAt); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return } ; out = append(out,a) }
    if rows.Err() != nil { jsonResp(w, 500, map[string]string{"error": rows.Err().Error()}); return }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleDashboardStats(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    var totalBookings int64
    var approvedBookings int64
    var totalRevenue float64
    if err := s.pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings").Scan(&totalBookings); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if err := s.pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings WHERE status='approved'").Scan(&approvedBookings); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    if err := s.pool.QueryRow(r.Context(), "SELECT COALESCE(SUM(total_price)::float8, 0) FROM bookings WHERE status='paid'").Scan(&totalRevenue); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    jsonResp(w, 200, map[string]any{"total_bookings": totalBookings, "approved_bookings": approvedBookings, "total_revenue": totalRevenue})
}

func ensureSchema(ctx context.Context, pool *pgxpool.Pool) {
    _, _ = pool.Exec(ctx, `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_owner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS icals (
  id SERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  from_ts TIMESTAMP NOT NULL,
  to_ts TIMESTAMP NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT,
  status TEXT,
  check_in TIMESTAMP,
  check_out TIMESTAMP,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  number_of_guests INT,
  total_price NUMERIC,
  stripe_intent_id TEXT,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  booking_id UUID,
  sender_email TEXT,
  is_from_owner BOOLEAN,
  message TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  owner_email TEXT,
  property_name TEXT,
  checkin_time TEXT,
  checkout_time TEXT,
  base_price NUMERIC,
  weekend_price NUMERIC,
  cleaning_fee NUMERIC,
  service_fee NUMERIC,
  discount_weekly NUMERIC,
  discount_monthly NUMERIC,
  updated_at TIMESTAMP DEFAULT now()
);
`)
_, _ = pool.Exec(ctx, `
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS subtotal_price NUMERIC;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC;
ALTER TABLE icals ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_token TEXT;
`)
}

func (s *Server) handleAddBlock(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    var body struct{ From, To string; Note string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.From == "" || body.To == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    var from, to time.Time
    from, _ = time.Parse(time.RFC3339, body.From)
    to, _ = time.Parse(time.RFC3339, body.To)
    _, _ = s.pool.Exec(r.Context(), "INSERT INTO blocks (from_ts, to_ts, note) VALUES ($1,$2,$3)", from, to, body.Note)
    jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleListBlocks(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    rows, _ := s.pool.Query(r.Context(), "SELECT id, from_ts, to_ts, note, created_at FROM blocks ORDER BY from_ts DESC")
    type rec struct{ ID int64; From time.Time; To time.Time; Note string; CreatedAt time.Time }
    var out []rec
    for rows.Next() { var a rec; _ = rows.Scan(&a.ID,&a.From,&a.To,&a.Note,&a.CreatedAt); out = append(out,a) }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleUnblockRange(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    var body struct{ From, To string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.From == "" || body.To == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    var from, to time.Time
    from, _ = time.Parse(time.RFC3339, body.From)
    to, _ = time.Parse(time.RFC3339, body.To)
    // Delete any block overlapping the range
    _, _ = s.pool.Exec(r.Context(), "DELETE FROM blocks WHERE NOT (to_ts < $1 OR from_ts > $2)", from, to)
    jsonResp(w, 200, map[string]bool{"success": true})
}

type Hub struct {
    rooms map[string]map[*websocket.Conn]struct{}
}

func NewHub() *Hub { return &Hub{ rooms: make(map[string]map[*websocket.Conn]struct{}) } }
func (h *Hub) Add(room string, c *websocket.Conn) {
    if _, ok := h.rooms[room]; !ok { h.rooms[room] = make(map[*websocket.Conn]struct{}) }
    h.rooms[room][c] = struct{}{}
}
func (h *Hub) Remove(room string, c *websocket.Conn) {
    if m, ok := h.rooms[room]; ok { delete(m, c); if len(m) == 0 { delete(h.rooms, room) } }
}
func (h *Hub) Broadcast(room string, payload []byte) {
    if conns, ok := h.rooms[room]; ok {
        for c := range conns {
            _ = c.WriteMessage(websocket.TextMessage, payload)
        }
    }
}

func (s *Server) handleWSMessages(w http.ResponseWriter, r *http.Request) {
    bookingID := r.URL.Query().Get("booking_id")
    tokenStr := r.URL.Query().Get("token")
    if bookingID == "" || tokenStr == "" { http.Error(w, "missing params", http.StatusBadRequest); return }
    tkn, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) { return []byte(s.jwtSecret), nil })
    if err != nil || !tkn.Valid { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
    upgrader := websocket.Upgrader{ CheckOrigin: func(r *http.Request) bool { return true } }
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil { log.Println("ws upgrade error:", err); http.Error(w, "upgrade_failed", http.StatusInternalServerError); return }
    s.hub.Add(bookingID, conn)
    // Optional: send a hello message
    _ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"hello"}`))
    go func() {
        defer func() { s.hub.Remove(bookingID, conn); conn.Close() }()
        for {
            // Read and discard client messages (we only push server events)
            if _, _, err := conn.ReadMessage(); err != nil { break }
        }
    }()
}

func main() {
    _ = godotenv.Load()
    dsn := os.Getenv("PG_DSN")
    if dsn == "" { log.Fatal("PG_DSN não definido no .env") }
    secret := os.Getenv("JWT_SECRET")
    if secret == "" { secret = "dev-secret" }
    cfg, _ := pgxpool.ParseConfig(dsn)
    pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
    if err != nil { panic(err) }
    ensureSchema(context.Background(), pool)
    if _, err := pool.Exec(context.Background(), "SELECT 1"); err == nil {
        log.Println("Conexão com o banco de dados estabelecida com sucesso")
    }
    stripeSecret := os.Getenv("STRIPE_SECRET_KEY")
    stripePublic := os.Getenv("STRIPE_PUBLIC_KEY")
    s := &Server{ pool: pool, jwtSecret: secret, hub: NewHub(), stripeSecret: stripeSecret, stripePublic: stripePublic }
    emailClient := emailpkg.NewResendClient()
    s.email = emailpkg.NewEmailService(emailClient)
    r := mux.NewRouter()
    r.Use(func(h http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
            origin := req.Header.Get("Origin")
            if origin != "" {
                w.Header().Set("Access-Control-Allow-Origin", origin)
                w.Header().Set("Vary", "Origin")
            } else {
                w.Header().Set("Access-Control-Allow-Origin", "*")
            }
            w.Header().Set("Access-Control-Allow-Credentials", "true")
            reqHeaders := req.Header.Get("Access-Control-Request-Headers")
            if reqHeaders == "" { reqHeaders = "Authorization, Content-Type" }
            w.Header().Set("Access-Control-Allow-Headers", reqHeaders)
            w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
            if req.Method == http.MethodOptions { w.WriteHeader(http.StatusNoContent); return }
            h.ServeHTTP(w, req)
    })
    })
    r.HandleFunc("/{_:.*}", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    // Explicit OPTIONS handlers for known routes to avoid 405 preflight failures
    r.HandleFunc("/auth/login", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/auth/register", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/auth/me", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/ical", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/ical/{id}", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/ical/sync", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/ical/last-sync", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/blocks", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/blocks/unblock", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings/mine", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings/{id}/approve", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings/{id}/reject", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/messages", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/ws/messages", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/calendar/merged.ics", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/stats/dashboard", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.MethodNotAllowedHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
        origin := req.Header.Get("Origin")
        if origin != "" { w.Header().Set("Access-Control-Allow-Origin", origin); w.Header().Set("Vary", "Origin") } else { w.Header().Set("Access-Control-Allow-Origin", "*") }
        w.Header().Set("Access-Control-Allow-Credentials", "true")
        reqHeaders := req.Header.Get("Access-Control-Request-Headers")
        if reqHeaders == "" { reqHeaders = "Authorization, Content-Type" }
        w.Header().Set("Access-Control-Allow-Headers", reqHeaders)
        w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        if req.Method == http.MethodOptions { w.WriteHeader(http.StatusNoContent); return }
        w.WriteHeader(http.StatusMethodNotAllowed)
    })
    r.HandleFunc("/auth/register", s.handleRegister).Methods("POST")
    r.HandleFunc("/auth/login", s.handleLogin).Methods("POST")
    r.Handle("/auth/me", s.authMiddleware(http.HandlerFunc(s.handleMe))).Methods("GET")
    r.Handle("/ical", s.authMiddleware(http.HandlerFunc(s.handleAddIcal))).Methods("POST")
    r.Handle("/ical", s.authMiddleware(http.HandlerFunc(s.handleListIcal))).Methods("GET")
    r.Handle("/ical/{id}", s.authMiddleware(http.HandlerFunc(s.handleDeleteIcal))).Methods("DELETE")
    r.Handle("/ical/sync", s.authMiddleware(http.HandlerFunc(s.handleSyncIcal))).Methods("POST")
    r.Handle("/ical/last-sync", s.authMiddleware(http.HandlerFunc(s.handleLastSync))).Methods("GET")
    r.Handle("/blocks", s.authMiddleware(http.HandlerFunc(s.handleAddBlock))).Methods("POST")
    r.Handle("/blocks", s.authMiddleware(http.HandlerFunc(s.handleListBlocks))).Methods("GET")
    r.Handle("/blocks/unblock", s.authMiddleware(http.HandlerFunc(s.handleUnblockRange))).Methods("POST")
    r.HandleFunc("/calendar/merged.ics", s.handleMergedICS).Methods("GET")
    r.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods("GET")
    r.HandleFunc("/test/send-email", func(w http.ResponseWriter, r *http.Request) {
        to := r.URL.Query().Get("to")
        if to == "" { jsonResp(w, 400, map[string]string{"error":"missing_to"}); return }
        subject := r.URL.Query().Get("subject")
        if subject == "" { subject = "Teste Resend" }
        html := r.URL.Query().Get("html")
        text := r.URL.Query().Get("text")
        if html == "" && text == "" {
            html = emailpkg.AccountConfirmationTemplate(emailpkg.AccountConfirmationData{ Name: "Teste", VerificationLink: "https://example.com/verify" })
        }
        if s.email == nil { jsonResp(w, 500, map[string]string{"error":"missing_api_key"}); return }
        if err := s.email.SendRawEmail(to, subject, html, text); err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
        jsonResp(w, 200, map[string]bool{"sent": true})
    }).Methods("GET")
    r.HandleFunc("/settings/public", s.handleGetSettingsPublic).Methods("GET")
    r.HandleFunc("/bookings", s.handleCreateBooking).Methods("POST")
    r.Handle("/bookings", s.authMiddleware(http.HandlerFunc(s.handleListBookingsOwner))).Methods("GET")
    r.Handle("/bookings/mine", s.authMiddleware(http.HandlerFunc(s.handleListBookingsMine))).Methods("GET")
    r.Handle("/bookings/{id}/approve", s.authMiddleware(http.HandlerFunc(s.handleApprove))).Methods("POST")
    r.Handle("/bookings/{id}/reject", s.authMiddleware(http.HandlerFunc(s.handleReject))).Methods("POST")
    r.HandleFunc("/bookings/{id}/payment-intent", s.handleCreatePaymentIntent).Methods("POST")
    r.HandleFunc("/bookings/{id}/mark-paid", s.handleMarkPaid).Methods("POST")
    r.Handle("/messages", s.authMiddleware(http.HandlerFunc(s.handlePostMessage))).Methods("POST")
    r.Handle("/messages", s.authMiddleware(http.HandlerFunc(s.handleGetMessages))).Methods("GET")
    r.HandleFunc("/ws/messages", s.handleWSMessages).Methods("GET")
    r.Handle("/stats/dashboard", s.authMiddleware(http.HandlerFunc(s.handleDashboardStats))).Methods("GET")
    r.Handle("/settings", s.authMiddleware(http.HandlerFunc(s.handleGetSettings))).Methods("GET")
    r.Handle("/settings", s.authMiddleware(http.HandlerFunc(s.handlePutSettings))).Methods("PUT")
    go func() {
        for {
            s.refreshMergedICS(context.Background())
            time.Sleep(10 * time.Minute)
        }
    }()
    port := os.Getenv("PORT")
    if port == "" { port = "3005" }
    log.Printf("Servidor iniciado na porta %s", port)
    http.ListenAndServe(":"+port, r)
}
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    row := s.pool.QueryRow(r.Context(), "SELECT COALESCE(property_name,''), COALESCE(checkin_time,''), COALESCE(checkout_time,''), COALESCE(base_price,0)::float8, COALESCE(weekend_price,0)::float8, COALESCE(cleaning_fee,0)::float8, COALESCE(service_fee,0)::float8, COALESCE(discount_weekly,0)::float8, COALESCE(discount_monthly,0)::float8 FROM settings WHERE owner_email=$1 ORDER BY id DESC LIMIT 1", c["email"])
    var propertyName, checkin, checkout string
    var base, weekend, cleaning, service, dw, dm float64
    _ = row.Scan(&propertyName, &checkin, &checkout, &base, &weekend, &cleaning, &service, &dw, &dm)
    jsonResp(w, 200, map[string]any{"settings": map[string]any{"property_name": propertyName, "checkin_time": checkin, "checkout_time": checkout, "base_price": base, "weekend_price": weekend, "cleaning_fee": cleaning, "service_fee": service, "discount_weekly": dw, "discount_monthly": dm}})
}
func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    var body struct{
        PropertyName string
        CheckinTime string
        CheckoutTime string
        BasePrice float64
        WeekendPrice float64
        CleaningFee float64
        ServiceFee float64
        DiscountWeekly float64
        DiscountMonthly float64
    }
    _ = json.NewDecoder(r.Body).Decode(&body)
    var exists bool
    _ = s.pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM settings WHERE owner_email=$1)", c["email"]).Scan(&exists)
    if exists {
        _, _ = s.pool.Exec(r.Context(), "UPDATE settings SET property_name=$1, checkin_time=$2, checkout_time=$3, base_price=$4, weekend_price=$5, cleaning_fee=$6, service_fee=$7, discount_weekly=$8, discount_monthly=$9, updated_at=now() WHERE owner_email=$10", body.PropertyName, body.CheckinTime, body.CheckoutTime, body.BasePrice, body.WeekendPrice, body.CleaningFee, body.ServiceFee, body.DiscountWeekly, body.DiscountMonthly, c["email"])
    } else {
        _, _ = s.pool.Exec(r.Context(), "INSERT INTO settings (owner_email, property_name, checkin_time, checkout_time, base_price, weekend_price, cleaning_fee, service_fee, discount_weekly, discount_monthly) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", c["email"], body.PropertyName, body.CheckinTime, body.CheckoutTime, body.BasePrice, body.WeekendPrice, body.CleaningFee, body.ServiceFee, body.DiscountWeekly, body.DiscountMonthly)
    }
    jsonResp(w, 200, map[string]bool{"success": true})
}
func (s *Server) handleGetSettingsPublic(w http.ResponseWriter, r *http.Request) {
    row := s.pool.QueryRow(r.Context(), "SELECT COALESCE(property_name,''), COALESCE(checkin_time,''), COALESCE(checkout_time,''), COALESCE(base_price,0)::float8, COALESCE(weekend_price,0)::float8, COALESCE(cleaning_fee,0)::float8, COALESCE(service_fee,0)::float8, COALESCE(discount_weekly,0)::float8, COALESCE(discount_monthly,0)::float8 FROM settings ORDER BY id DESC LIMIT 1")
    var propertyName, checkin, checkout string
    var base, weekend, cleaning, service, dw, dm float64
    _ = row.Scan(&propertyName, &checkin, &checkout, &base, &weekend, &cleaning, &service, &dw, &dm)
    jsonResp(w, 200, map[string]any{"settings": map[string]any{"property_name": propertyName, "checkin_time": checkin, "checkout_time": checkout, "base_price": base, "weekend_price": weekend, "cleaning_fee": cleaning, "service_fee": service, "discount_weekly": dw, "discount_monthly": dm}})
}

func (s *Server) handleCreatePaymentIntent(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    id := mux.Vars(r)["id"]
    if id == "" { jsonResp(w, 400, map[string]string{"error":"missing_id"}); return }
    if s.stripeSecret == "" { jsonResp(w, 500, map[string]string{"error":"stripe_not_configured"}); return }
    var userEmail, status string
    var total float64
    var guestEmail, guestName string
    err := s.pool.QueryRow(r.Context(), "SELECT COALESCE(user_email,''), COALESCE(status,'requested'), COALESCE(total_price,0)::float8, COALESCE(guest_email,''), COALESCE(guest_name,'') FROM bookings WHERE id=$1", id).Scan(&userEmail, &status, &total, &guestEmail, &guestName)
    if err != nil { jsonResp(w, 404, map[string]string{"error":"booking_not_found"}); return }
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner && c["email"] != userEmail { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    if status != "approved" { jsonResp(w, 409, map[string]string{"error":"booking_not_approved"}); return }
    amount := int64(total * 100)
    form := url.Values{}
    form.Set("amount", fmt.Sprintf("%d", amount))
    form.Set("currency", "brl")
    form.Set("automatic_payment_methods[enabled]", "true")
    form.Set("description", "Reserva "+guestName)
    form.Set("metadata[booking_id]", id)
    req, _ := http.NewRequest("POST", "https://api.stripe.com/v1/payment_intents", strings.NewReader(form.Encode()))
    req.Header.Set("Authorization", "Bearer "+s.stripeSecret)
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    resp, err := http.DefaultClient.Do(req)
    if err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    defer resp.Body.Close()
    body, _ := io.ReadAll(resp.Body)
    if resp.StatusCode >= 300 {
      jsonResp(w, resp.StatusCode, map[string]any{"error":"stripe_error", "body": string(body)})
      return
    }
    var si struct{ ID string `json:"id"`; ClientSecret string `json:"client_secret"` }
    _ = json.Unmarshal(body, &si)
    if si.ID != "" { _, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET stripe_intent_id=$1 WHERE id=$2", si.ID, id) }
    jsonResp(w, 200, map[string]any{"client_secret": si.ClientSecret, "publishable_key": s.stripePublic})
}

func (s *Server) handleMarkPaid(w http.ResponseWriter, r *http.Request) {
    id := mux.Vars(r)["id"]
    if id == "" { jsonResp(w, 400, map[string]string{"error":"missing_id"}); return }
    if s.stripeSecret == "" { jsonResp(w, 500, map[string]string{"error":"stripe_not_configured"}); return }
    var intentID string
    _ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(stripe_intent_id,'') FROM bookings WHERE id=$1", id).Scan(&intentID)
    if intentID == "" { jsonResp(w, 409, map[string]string{"error":"no_intent"}); return }
    req, _ := http.NewRequest("GET", "https://api.stripe.com/v1/payment_intents/"+intentID, nil)
    req.Header.Set("Authorization", "Bearer "+s.stripeSecret)
    resp, err := http.DefaultClient.Do(req)
    if err != nil { jsonResp(w, 500, map[string]string{"error": err.Error()}); return }
    defer resp.Body.Close()
    body, _ := io.ReadAll(resp.Body)
    var si struct{ Status string `json:"status"` }
    _ = json.Unmarshal(body, &si)
    if si.Status == "succeeded" {
        _, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET status='paid', paid_at=now(), updated_at=now() WHERE id=$1", id)
        var guestEmail, guestName string
        var total float64
        _ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(guest_email,''), COALESCE(guest_name,''), COALESCE(total_price,0)::float8 FROM bookings WHERE id=$1", id).Scan(&guestEmail, &guestName, &total)
        if s.email != nil {
            _ = s.email.SendPaymentConfirmationEmail(guestEmail, emailpkg.PaymentEmailData{ Name: guestName, Amount: total, Date: time.Now().Format(time.RFC3339), ReservationID: id })
        }
        jsonResp(w, 200, map[string]bool{"paid": true})
        return
    }
    jsonResp(w, 200, map[string]any{"paid": false, "status": si.Status})
}