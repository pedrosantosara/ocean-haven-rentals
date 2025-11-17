package main

import (
    "context"
    "encoding/json"
    "io"
    "net/http"
    "os"
    "regexp"
    "strings"
    "time"
    "github.com/golang-jwt/jwt/v5"
    "github.com/gorilla/mux"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/joho/godotenv"
    "golang.org/x/crypto/bcrypt"
)

type Server struct {
    pool *pgxpool.Pool
    jwtSecret string
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
    if err != nil { jsonResp(w, 409, map[string]string{"error":"email_exists"}); return }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"email": body.Email, "is_owner": body.IsOwner, "exp": time.Now().Add(7*24*time.Hour).Unix()})
    str, _ := token.SignedString([]byte(s.jwtSecret))
    jsonResp(w, 200, map[string]string{"token": str})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
    var body struct{ Email, Password string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    var email string; var hash string; var isOwner bool
    err := s.pool.QueryRow(r.Context(), "SELECT email, password_hash, is_owner FROM users WHERE email=$1", body.Email).Scan(&email, &hash, &isOwner)
    if err != nil { jsonResp(w, 401, map[string]string{"error":"invalid_credentials"}); return }
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
    _ = s.pool.QueryRow(r.Context(), "SELECT full_name, is_owner FROM users WHERE email=$1", c["email"]).Scan(&fullName, &isOwner)
    jsonResp(w, 200, map[string]any{"user": map[string]any{"email": c["email"], "full_name": fullName, "is_owner": isOwner}})
}

func (s *Server) handleAddIcal(w http.ResponseWriter, r *http.Request) {
    var body struct{ Platform, Url string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.Platform == "" || body.Url == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    _, _ = s.pool.Exec(r.Context(), "INSERT INTO icals (platform, url) VALUES ($1,$2)", body.Platform, body.Url)
    jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleListIcal(w http.ResponseWriter, r *http.Request) {
    rows, _ := s.pool.Query(r.Context(), "SELECT id, platform, url, created_at FROM icals ORDER BY created_at DESC")
    type rec struct{ ID int64 `json:"id"`; Platform string `json:"platform"`; Url string `json:"url"`; CreatedAt time.Time `json:"created_at"` }
    var out []rec
    for rows.Next() { var a rec; _ = rows.Scan(&a.ID,&a.Platform,&a.Url,&a.CreatedAt); out = append(out,a) }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleDeleteIcal(w http.ResponseWriter, r *http.Request) {
    id := mux.Vars(r)["id"]
    _, _ = s.pool.Exec(r.Context(), "DELETE FROM icals WHERE id=$1", id)
    jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleMergedICS(w http.ResponseWriter, r *http.Request) {
    var vevents []string
    rows, _ := s.pool.Query(r.Context(), "SELECT platform, url FROM icals")
    for rows.Next() {
        var platform, u string
        _ = rows.Scan(&platform, &u)
        resp, err := http.Get(u)
        if err != nil { continue }
        body, err := io.ReadAll(resp.Body)
        resp.Body.Close()
        if err != nil { continue }
        evs := extractEventsFromICSWithCategory(string(body), platform)
        vevents = append(vevents, evs...)
    }
    // Include manual blocks
    bl, _ := s.pool.Query(r.Context(), "SELECT id, from_ts, to_ts, note FROM blocks")
    for bl.Next() {
        var id int64; var from, to time.Time; var note string
        _ = bl.Scan(&id, &from, &to, &note)
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
    bro, _ := s.pool.Query(r.Context(), "SELECT id, guest_name, check_in, check_out, status FROM bookings")
    for bro.Next() {
        var id, guest, status string; var ci, co time.Time
        _ = bro.Scan(&id,&guest,&ci,&co,&status)
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
    w.Header().Set("Content-Type", "text/calendar")
    _, _ = w.Write([]byte(b.String()))
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

//

func (s *Server) handleCreateBooking(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var body struct{ CheckIn, CheckOut string; GuestName, GuestEmail, GuestPhone string; NumberOfGuests int; TotalPrice float64 }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.CheckIn == "" || body.CheckOut == "" || body.GuestName == "" || body.GuestEmail == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    _, _ = s.pool.Exec(r.Context(), "INSERT INTO bookings (user_email,status,check_in,check_out,guest_name,guest_email,guest_phone,number_of_guests,total_price) VALUES ($1,'requested',$2,$3,$4,$5,$6,$7,$8)", c["email"], body.CheckIn, body.CheckOut, body.GuestName, body.GuestEmail, body.GuestPhone, body.NumberOfGuests, body.TotalPrice)
    jsonResp(w, 200, map[string]string{"status":"requested"})
}

func (s *Server) handleListBookingsOwner(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    rows, _ := s.pool.Query(r.Context(), "SELECT id, user_email, status, check_in, check_out, guest_name, guest_email, guest_phone, number_of_guests, total_price, created_at FROM bookings ORDER BY created_at DESC")
    type rec struct{ ID string; UserEmail string; Status string; CheckIn time.Time; CheckOut time.Time; GuestName string; GuestEmail string; GuestPhone string; NumberOfGuests int; TotalPrice float64; CreatedAt time.Time }
    var out []rec
    for rows.Next() { var a rec; _ = rows.Scan(&a.ID,&a.UserEmail,&a.Status,&a.CheckIn,&a.CheckOut,&a.GuestName,&a.GuestEmail,&a.GuestPhone,&a.NumberOfGuests,&a.TotalPrice,&a.CreatedAt); out = append(out,a) }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleListBookingsMine(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    rows, _ := s.pool.Query(r.Context(), "SELECT id, status, check_in, check_out, guest_name, number_of_guests, total_price, created_at FROM bookings WHERE user_email=$1 ORDER BY created_at DESC", c["email"])
    type rec struct{ ID string; Status string; CheckIn time.Time; CheckOut time.Time; GuestName string; NumberOfGuests int; TotalPrice float64; CreatedAt time.Time }
    var out []rec
    for rows.Next() { var a rec; _ = rows.Scan(&a.ID,&a.Status,&a.CheckIn,&a.CheckOut,&a.GuestName,&a.NumberOfGuests,&a.TotalPrice,&a.CreatedAt); out = append(out,a) }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleApprove(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    id := mux.Vars(r)["id"]
    _, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET status='approved', updated_at=now() WHERE id=$1", id)
    jsonResp(w, 200, map[string]string{"status":"approved"})
}

func (s *Server) handleReject(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    id := mux.Vars(r)["id"]
    _, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET status='rejected', updated_at=now() WHERE id=$1", id)
    jsonResp(w, 200, map[string]string{"status":"rejected"})
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var body struct{ BookingID, Message string }
    _ = json.NewDecoder(r.Body).Decode(&body)
    if body.BookingID == "" || body.Message == "" { jsonResp(w, 400, map[string]string{"error":"invalid_input"}); return }
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    _, _ = s.pool.Exec(r.Context(), "INSERT INTO messages (booking_id, sender_email, is_from_owner, message) VALUES ($1,$2,$3,$4)", body.BookingID, c["email"], isOwner, body.Message)
    jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleGetMessages(w http.ResponseWriter, r *http.Request) {
    bookingID := r.URL.Query().Get("booking_id")
    rows, _ := s.pool.Query(r.Context(), "SELECT id, booking_id, sender_email, is_from_owner, message, created_at FROM messages WHERE booking_id=$1 ORDER BY created_at ASC", bookingID)
    type rec struct{ ID int64; BookingID string; SenderEmail string; IsFromOwner bool; Message string; CreatedAt time.Time }
    var out []rec
    for rows.Next() { var a rec; _ = rows.Scan(&a.ID,&a.BookingID,&a.SenderEmail,&a.IsFromOwner,&a.Message,&a.CreatedAt); out = append(out,a) }
    jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleDashboardStats(w http.ResponseWriter, r *http.Request) {
    c := getClaims(r)
    var isOwner bool
    _ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
    if !isOwner { jsonResp(w, 403, map[string]string{"error":"forbidden"}); return }
    var totalBookings int64
    var confirmedBookings int64
    var totalRevenue float64
    _ = s.pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings").Scan(&totalBookings)
    _ = s.pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings WHERE status='approved'").Scan(&confirmedBookings)
    _ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(SUM(total_price)::float8, 0) FROM bookings WHERE status='approved'").Scan(&totalRevenue)
    jsonResp(w, 200, map[string]any{"total_bookings": totalBookings, "confirmed_bookings": confirmedBookings, "total_revenue": totalRevenue})
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
`)
}

func main() {
    _ = godotenv.Load()
    dsn := os.Getenv("PG_DSN")
    if dsn == "" { dsn = "postgres://postgres:72fv20ed@localhost:5432/mb-vacations?sslmode=disable" }
    secret := os.Getenv("JWT_SECRET")
    if secret == "" { secret = "dev-secret" }
    cfg, _ := pgxpool.ParseConfig(dsn)
    pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
    if err != nil { panic(err) }
    ensureSchema(context.Background(), pool)
    s := &Server{ pool: pool, jwtSecret: secret }
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
    r.HandleFunc("/blocks", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/blocks/unblock", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings/mine", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings/{id}/approve", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/bookings/{id}/reject", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
    r.HandleFunc("/messages", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
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
    r.Handle("/blocks", s.authMiddleware(http.HandlerFunc(s.handleAddBlock))).Methods("POST")
    r.Handle("/blocks", s.authMiddleware(http.HandlerFunc(s.handleListBlocks))).Methods("GET")
    r.Handle("/blocks/unblock", s.authMiddleware(http.HandlerFunc(s.handleUnblockRange))).Methods("POST")
    r.HandleFunc("/calendar/merged.ics", s.handleMergedICS).Methods("GET")
    r.HandleFunc("/bookings", s.handleCreateBooking).Methods("POST")
    r.Handle("/bookings", s.authMiddleware(http.HandlerFunc(s.handleListBookingsOwner))).Methods("GET")
    r.Handle("/bookings/mine", s.authMiddleware(http.HandlerFunc(s.handleListBookingsMine))).Methods("GET")
    r.Handle("/bookings/{id}/approve", s.authMiddleware(http.HandlerFunc(s.handleApprove))).Methods("POST")
    r.Handle("/bookings/{id}/reject", s.authMiddleware(http.HandlerFunc(s.handleReject))).Methods("POST")
    r.Handle("/messages", s.authMiddleware(http.HandlerFunc(s.handlePostMessage))).Methods("POST")
    r.Handle("/messages", s.authMiddleware(http.HandlerFunc(s.handleGetMessages))).Methods("GET")
    r.Handle("/stats/dashboard", s.authMiddleware(http.HandlerFunc(s.handleDashboardStats))).Methods("GET")
    http.ListenAndServe(":3005", r)
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