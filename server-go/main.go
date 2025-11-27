package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	emailpkg "ocean-haven-rentals/internal/email"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

type ctxKey string

const userCtxKey ctxKey = "user"

type Server struct {
	pool           *pgxpool.Pool
	jwtSecret      string
	hub            *Hub
	icsCache       string
	icsLastUpdated time.Time
	stripeSecret   string
	stripePublic   string
	email          *emailpkg.EmailService
	chatTimers     sync.Map
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
			jsonResp(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		tokenStr := strings.TrimPrefix(hdr, "Bearer ")
		tkn, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) { return []byte(s.jwtSecret), nil })
		if err != nil || !tkn.Valid {
			jsonResp(w, http.StatusUnauthorized, map[string]string{"error": "invalid_token"})
			return
		}
		claims, ok := tkn.Claims.(jwt.MapClaims)
		if !ok {
			jsonResp(w, http.StatusUnauthorized, map[string]string{"error": "invalid_token"})
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email, Password, FullName string
		IsOwner                   bool
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Email == "" || body.Password == "" {
		jsonResp(w, 400, map[string]string{"error": "invalid_input"})
		return
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte(body.Password), 10)
	_, err := s.pool.Exec(r.Context(), "INSERT INTO users (email, password_hash, full_name, is_owner) VALUES ($1,$2,$3,$4)", body.Email, string(hash), body.FullName, body.IsOwner)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	// Associate past guest bookings with this new user
	_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET customer_id = (SELECT id FROM users WHERE email=$1) WHERE guest_email=$1 AND customer_id IS NULL", body.Email)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"email": body.Email, "is_owner": body.IsOwner, "exp": time.Now().Add(7 * 24 * time.Hour).Unix()})
	str, _ := token.SignedString([]byte(s.jwtSecret))
	if s.email != nil {
		link := "https://localhost:3000/verify?email=" + url.QueryEscape(body.Email)
		_ = s.email.SendAccountConfirmationEmail(body.Email, emailpkg.AccountConfirmationData{Name: body.FullName, VerificationLink: link})
	}
	jsonResp(w, 200, map[string]string{"token": str})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct{ Email, Password string }
	_ = json.NewDecoder(r.Body).Decode(&body)
	var email string
	var hash string
	var isOwner bool
	err := s.pool.QueryRow(r.Context(), "SELECT email, password_hash, is_owner FROM users WHERE email=$1", body.Email).Scan(&email, &hash, &isOwner)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonResp(w, 401, map[string]string{"error": "invalid_credentials"})
			return
		}
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil {
		jsonResp(w, 401, map[string]string{"error": "invalid_credentials"})
		return
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"email": email, "is_owner": isOwner, "exp": time.Now().Add(7 * 24 * time.Hour).Unix()})
	str, _ := token.SignedString([]byte(s.jwtSecret))
	jsonResp(w, 200, map[string]string{"token": str})
}

func getClaims(r *http.Request) jwt.MapClaims {
	v := r.Context().Value(userCtxKey)
	if v == nil {
		return jwt.MapClaims{}
	}
	return v.(jwt.MapClaims)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var fullName string
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(full_name,'') AS full_name, COALESCE(is_owner,false) AS is_owner FROM users WHERE email=$1", c["email"]).Scan(&fullName, &isOwner)
	jsonResp(w, 200, map[string]any{"user": map[string]any{"email": c["email"], "full_name": fullName, "is_owner": isOwner}})
}

func (s *Server) handleAddIcal(w http.ResponseWriter, r *http.Request) {
	var body struct{ Platform, Url string }
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Platform == "" || body.Url == "" {
		jsonResp(w, 400, map[string]string{"error": "invalid_input"})
		return
	}
	if _, err := s.pool.Exec(r.Context(), "INSERT INTO icals (platform, url) VALUES ($1,$2)", body.Platform, body.Url); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleListIcal(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), "SELECT id, platform, url, COALESCE(created_at, now()) AS created_at, last_sync FROM icals ORDER BY created_at DESC")
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	type rec struct {
		ID        int64      `json:"id"`
		Platform  string     `json:"platform"`
		Url       string     `json:"url"`
		CreatedAt time.Time  `json:"created_at"`
		LastSync  *time.Time `json:"last_sync,omitempty"`
	}
	var out []rec
	for rows.Next() {
		var a rec
		if err := rows.Scan(&a.ID, &a.Platform, &a.Url, &a.CreatedAt, &a.LastSync); err != nil {
			jsonResp(w, 500, map[string]string{"error": err.Error()})
			return
		}
		out = append(out, a)
	}
	if rows.Err() != nil {
		jsonResp(w, 500, map[string]string{"error": rows.Err().Error()})
		return
	}
	jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleDeleteIcal(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if _, err := s.pool.Exec(r.Context(), "DELETE FROM icals WHERE id=$1", id); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
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
	if err != nil {
		return
	}
	for rows.Next() {
		var rid int64
		var platform, u string
		if err = rows.Scan(&rid, &platform, &u); err != nil {
			return
		}
		resp, err2 := http.Get(u)
		if err2 != nil {
			continue
		}

		body, err2 := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err2 != nil {
			continue
		}
		evs := extractEventsFromICSWithCategory(string(body), platform)
		vevents = append(vevents, evs...)
		_, _ = s.pool.Exec(ctx, "UPDATE icals SET last_sync=now() WHERE id=$1", rid)
	}
	bl, err := s.pool.Query(ctx, "SELECT id, from_ts, to_ts, COALESCE(note,'') AS note FROM blocks")
	if err != nil {
		return
	}
	for bl.Next() {
		var id int64
		var from, to time.Time
		var note string
		if err = bl.Scan(&id, &from, &to, &note); err != nil {
			return
		}
		var sb strings.Builder
		sb.WriteString("BEGIN:VEVENT\n")
		sb.WriteString("UID:block-" + time.UnixMilli(time.Now().UnixMilli()).Format("20060102150405") + "-" + time.Now().Format("150405") + "\n")
		sb.WriteString("SUMMARY:" + func() string {
			if note != "" {
				return note
			}
			return "Bloqueio"
		}() + "\n")
		sb.WriteString("CATEGORIES:Block\n")
		sb.WriteString("DTSTART:" + from.UTC().Format("20060102T150405Z") + "\n")
		sb.WriteString("DTEND:" + to.UTC().Format("20060102T150405Z") + "\n")
		sb.WriteString("STATUS:CONFIRMED\n")
		sb.WriteString("END:VEVENT\n")
		vevents = append(vevents, sb.String())
	}
	bro, err := s.pool.Query(ctx, "SELECT id, COALESCE(guest_name,'') AS guest_name, check_in, check_out, COALESCE(status,'requested') AS status FROM bookings")
	if err != nil {
		return
	}
	for bro.Next() {
		var id, guest, status string
		var ci, co time.Time
		if err := bro.Scan(&id, &guest, &ci, &co, &status); err != nil {
			return
		}
		if status == "rejected" {
			continue
		}
		var sb strings.Builder
		sb.WriteString("BEGIN:VEVENT\n")

		sb.WriteString("UID:" + id + "\n")
		sb.WriteString("SUMMARY:Reserva " + guest + "\n")
		sb.WriteString("CATEGORIES:Site\n")
		sb.WriteString("DTSTART:" + ci.UTC().Format("20060102T150405Z") + "\n")
		sb.WriteString("DTEND:" + co.UTC().Format("20060102T150405Z") + "\n")
		if status == "approved" {
			sb.WriteString("STATUS:CONFIRMED\n")
		} else {
			sb.WriteString("STATUS:TENTATIVE\n")
		}
		sb.WriteString("END:VEVENT\n")
		vevents = append(vevents, sb.String())
	}
	var b strings.Builder
	b.WriteString("BEGIN:VCALENDAR\n")
	b.WriteString("VERSION:2.0\n")
	b.WriteString("PRODID:-//ocean-haven//Merged Calendar//EN\n")
	for _, e := range vevents {
		b.WriteString(e)
	}
	b.WriteString("END:VCALENDAR\n")
	s.icsCache = b.String()
	s.icsLastUpdated = time.Now()
}

func (s *Server) handleSyncIcal(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
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
	var body struct {
		CheckIn, CheckOut                 string
		GuestName, GuestEmail, GuestPhone string
		NumberOfGuests                    int
		SubtotalPrice                     float64
		DiscountAmount                    float64
		TotalPrice                        float64
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	// Relaxed validation: CheckIn, CheckOut, GuestPhone are always required.
	// Name/Email required only if not authenticated (checked later).
	if body.CheckIn == "" || body.CheckOut == "" {
		jsonResp(w, 400, map[string]string{"error": "invalid_input"})
		return
	}

	var customerID *string
	var ownerID string
	_ = s.pool.QueryRow(r.Context(), "SELECT id FROM users WHERE is_owner=true ORDER BY created_at ASC LIMIT 1").Scan(&ownerID)

	// Try to find authenticated user
	if email, ok := c["email"].(string); ok && email != "" {
		var id, fullName, userEmail string
		if err := s.pool.QueryRow(r.Context(), "SELECT id, full_name, email FROM users WHERE email=$1", email).Scan(&id, &fullName, &userEmail); err == nil {
			customerID = &id
			// Auto-fill missing data from profile
			if body.GuestName == "" {
				body.GuestName = fullName
			}
			if body.GuestEmail == "" {
				body.GuestEmail = userEmail
			}
		}
	}

	// If still missing name/email (unauthenticated or profile incomplete), fail
	if body.GuestName == "" || body.GuestEmail == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_guest_info"})
		return
	}

	// For unauthenticated users, try to link by email if user exists (optional, but requested behavior is "stored... and when he creates account associate".
	// If account ALREADY exists, we should probably associate it now too?)
	// User said: "when he n t have account... stored... when he create account associate".
	// But if account exists, we should probably associate it.
	if customerID == nil {
		var id string
		if err := s.pool.QueryRow(r.Context(), "SELECT id FROM users WHERE email=$1", body.GuestEmail).Scan(&id); err == nil {
			customerID = &id
		}
	}

	// Calculate authoritative pricing
	var ciTS, coTS time.Time
	var ciStr, coStr string
	if t, e := time.Parse(time.RFC3339, body.CheckIn); e == nil {
		ciTS = t
		ciStr = t.Format("2006-01-02")
	} else if t2, e2 := time.Parse("2006-01-02", body.CheckIn); e2 == nil {
		ciTS = t2
		ciStr = body.CheckIn
	}
	if t, e := time.Parse(time.RFC3339, body.CheckOut); e == nil {
		coTS = t
		coStr = t.Format("2006-01-02")
	} else if t2, e2 := time.Parse("2006-01-02", body.CheckOut); e2 == nil {
		coTS = t2
		coStr = body.CheckOut
	}
	if ciStr == "" || coStr == "" {
		jsonResp(w, 400, map[string]string{"error": "invalid_dates"})
		return
	}
	pricing, err := s.calculatePrice(r.Context(), ciStr, coStr)
	if err != nil {
		jsonResp(w, 400, map[string]string{"error": err.Error()})
		return
	}

	if _, err := s.pool.Exec(r.Context(), "INSERT INTO bookings (owner_id,customer_id,status,check_in,check_out,guest_name,guest_email,guest_phone,number_of_guests,subtotal_price,discount_amount,total_price) VALUES ($1,$2,'requested',$3,$4,$5,$6,$7,$8,$9,$10,$11)", ownerID, customerID, ciTS, coTS, body.GuestName, body.GuestEmail, body.GuestPhone, body.NumberOfGuests, pricing.Subtotal, pricing.DiscountAmount, pricing.Total); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResp(w, 200, map[string]string{"status": "requested"})
}

type Pricing struct {
	Subtotal       float64       `json:"subtotal"`
	DiscountAmount float64       `json:"discount_amount"`
	CleaningFee    float64       `json:"cleaning_fee"`
	ServiceFee     float64       `json:"service_fee"`
	Total          float64       `json:"total"`
	Nights         int           `json:"nights"`
	WeekdayNights  int           `json:"weekday_nights"`
	WeekendNights  int           `json:"weekend_nights"`
	BasePrice      float64       `json:"base_price"`
	WeekendPrice   float64       `json:"weekend_price"`
	PriceBuckets   []PriceBucket `json:"price_buckets"`
}

type PriceBucket struct {
	Price float64 `json:"price"`
	Count int     `json:"count"`
}

func (s *Server) calculatePrice(ctx context.Context, checkInStr, checkOutStr string) (*Pricing, error) {
	checkIn, err := time.Parse("2006-01-02", checkInStr)
	if err != nil {
		return nil, err
	}
	checkOut, err := time.Parse("2006-01-02", checkOutStr)
	if err != nil {
		return nil, err
	}
	if !checkOut.After(checkIn) {
		return nil, fmt.Errorf("checkout must be after checkin")
	}

	// Fetch settings
	var base, weekend, cleaning, service, dw, dm float64
	// Use the most recently updated settings (assuming single property/owner context for now based on existing code)
	err = s.pool.QueryRow(ctx, "SELECT COALESCE(base_price,0)::float8, COALESCE(weekend_price,0)::float8, COALESCE(cleaning_fee,0)::float8, COALESCE(service_fee,0)::float8, COALESCE(discount_weekly,0)::float8, COALESCE(discount_monthly,0)::float8 FROM settings ORDER BY id DESC LIMIT 1").Scan(&base, &weekend, &cleaning, &service, &dw, &dm)
	if err != nil {
		return nil, err
	}

	var subtotal float64
	nights := 0
	weekdayNights := 0
	weekendNights := 0

	rows, _ := s.pool.Query(ctx, "SELECT date, COALESCE(price,0)::float8 FROM date_prices WHERE date >= $1 AND date < $2", checkIn, checkOut)
	overrides := make(map[string]float64)
	for rows.Next() {
		var d time.Time
		var p float64
		_ = rows.Scan(&d, &p)
		overrides[d.Format("2006-01-02")] = p
	}

	bucketCounts := make(map[float64]int)
	for d := checkIn; d.Before(checkOut); d = d.AddDate(0, 0, 1) {
		nights++
		key := d.Format("2006-01-02")
		price := base
		wd := d.Weekday()
		if v, ok := overrides[key]; ok {
			price = v
			if wd == time.Friday || wd == time.Saturday {
				weekendNights++
			} else {
				weekdayNights++
			}
		} else {
			if (wd == time.Friday || wd == time.Saturday) && weekend > 0 {
				price = weekend
				weekendNights++
			} else {
				weekdayNights++
			}
		}
		subtotal += price
		bucketCounts[price] = bucketCounts[price] + 1
	}

	discountPct := 0.0
	if nights >= 28 {
		discountPct = dm
	} else if nights >= 7 {
		discountPct = dw
	}

	discountAmount := subtotal * (discountPct / 100)
	total := subtotal - discountAmount + cleaning + service

	var buckets []PriceBucket
	for p, c := range bucketCounts {
		buckets = append(buckets, PriceBucket{Price: p, Count: c})
	}
	return &Pricing{
		Subtotal:       mathRound(subtotal, 2),
		DiscountAmount: mathRound(discountAmount, 2),
		CleaningFee:    mathRound(cleaning, 2),
		ServiceFee:     mathRound(service, 2),
		Total:          mathRound(total, 2),
		Nights:         nights,
		WeekdayNights:  weekdayNights,
		WeekendNights:  weekendNights,
		BasePrice:      base,
		WeekendPrice:   weekend,
		PriceBuckets:   buckets,
	}, nil
}

func (s *Server) handleCalculatePrice(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CheckIn  string `json:"check_in"`
		CheckOut string `json:"check_out"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonResp(w, 400, map[string]string{"error": "invalid_json"})
		return
	}
	if body.CheckIn == "" || body.CheckOut == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_dates"})
		return
	}

	pricing, err := s.calculatePrice(r.Context(), body.CheckIn, body.CheckOut)
	if err != nil {
		jsonResp(w, 400, map[string]string{"error": err.Error()})
		return
	}

	jsonResp(w, 200, pricing)
}

func (s *Server) handleListBookingsOwner(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var ownerID string
	_ = s.pool.QueryRow(r.Context(), "SELECT id FROM users WHERE email=$1", c["email"]).Scan(&ownerID)
	rows, err := s.pool.Query(r.Context(), "SELECT id, COALESCE(status,'requested') AS status, check_in, check_out, COALESCE(guest_name,'') AS guest_name, COALESCE(guest_email,'') AS guest_email, COALESCE(guest_phone,'') AS guest_phone, number_of_guests, COALESCE(subtotal_price,0)::float8 AS subtotal_price, COALESCE(discount_amount,0)::float8 AS discount_amount, COALESCE(total_price,0)::float8 AS total_price, COALESCE(created_at, now()) AS created_at FROM bookings WHERE owner_id=$1 ORDER BY created_at DESC", ownerID)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	type rec struct {
		ID             string
		Status         string
		CheckIn        time.Time
		CheckOut       time.Time
		GuestName      string
		GuestEmail     string
		GuestPhone     string
		NumberOfGuests int
		SubtotalPrice  float64
		DiscountAmount float64
		TotalPrice     float64
		CreatedAt      time.Time
	}
	var out []rec
	for rows.Next() {
		var a rec
		if err := rows.Scan(&a.ID, &a.Status, &a.CheckIn, &a.CheckOut, &a.GuestName, &a.GuestEmail, &a.GuestPhone, &a.NumberOfGuests, &a.SubtotalPrice, &a.DiscountAmount, &a.TotalPrice, &a.CreatedAt); err != nil {
			jsonResp(w, 500, map[string]string{"error": err.Error()})
			return
		}
		out = append(out, a)
	}
	if rows.Err() != nil {
		jsonResp(w, 500, map[string]string{"error": rows.Err().Error()})
		return
	}
	jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleListBookingsMine(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var customerID string
	_ = s.pool.QueryRow(r.Context(), "SELECT id FROM users WHERE email=$1", c["email"]).Scan(&customerID)
	rows, err := s.pool.Query(r.Context(), "SELECT id, COALESCE(status,'requested') AS status, check_in, check_out, COALESCE(guest_name,'') AS guest_name, number_of_guests, COALESCE(subtotal_price,0)::float8 AS subtotal_price, COALESCE(discount_amount,0)::float8 AS discount_amount, COALESCE(total_price,0)::float8 AS total_price, COALESCE(created_at, now()) AS created_at FROM bookings WHERE customer_id=$1 ORDER BY created_at DESC", customerID)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	type rec struct {
		ID             string
		Status         string
		CheckIn        time.Time
		CheckOut       time.Time
		GuestName      string
		NumberOfGuests int
		SubtotalPrice  float64
		DiscountAmount float64
		TotalPrice     float64
		CreatedAt      time.Time
	}
	var out []rec
	for rows.Next() {
		var a rec
		if err := rows.Scan(&a.ID, &a.Status, &a.CheckIn, &a.CheckOut, &a.GuestName, &a.NumberOfGuests, &a.SubtotalPrice, &a.DiscountAmount, &a.TotalPrice, &a.CreatedAt); err != nil {
			jsonResp(w, 500, map[string]string{"error": err.Error()})
			return
		}
		out = append(out, a)
	}
	if rows.Err() != nil {
		jsonResp(w, 500, map[string]string{"error": rows.Err().Error()})
		return
	}
	jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleApprove(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	id := mux.Vars(r)["id"]
	if _, err := s.pool.Exec(r.Context(), "UPDATE bookings SET status='approved', updated_at=now() WHERE id=$1", id); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	var guestName, guestEmail string
	var ci, co time.Time
	var guests int
	var total float64
	_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(guest_name,''), COALESCE(guest_email,''), check_in, check_out, COALESCE(number_of_guests,0), COALESCE(total_price,0)::float8 FROM bookings WHERE id=$1", id).Scan(&guestName, &guestEmail, &ci, &co, &guests, &total)
	// Generate one-time payment token and store
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	token := hex.EncodeToString(buf[:])
	_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET payment_token=$1 WHERE id=$2", token, id)
	var checkoutURL string
	if s.stripeSecret != "" {
		amount := int64(total * 100)
		form := url.Values{}
		form.Set("mode", "payment")
		form.Set("success_url", "http://localhost:3000/my-booking?payment=success&booking_id="+url.QueryEscape(id))
		form.Set("cancel_url", "http://localhost:3000/my-booking?payment=cancel&booking_id="+url.QueryEscape(id))
		form.Set("line_items[0][price_data][currency]", "brl")
		form.Set("line_items[0][price_data][product_data][name]", "Reserva "+guestName)
		form.Set("line_items[0][price_data][unit_amount]", fmt.Sprintf("%d", amount))
		form.Set("line_items[0][quantity]", "1")
		form.Set("metadata[booking_id]", id)
		form.Set("expand[0]", "payment_intent")
		form.Set("expand[0]", "payment_intent")
		req, _ := http.NewRequest("POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
		req.Header.Set("Authorization", "Bearer "+s.stripeSecret)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			defer resp.Body.Close()
			b, _ := io.ReadAll(resp.Body)
			var cs struct {
				ID, URL       string
				PaymentIntent struct{ ID string } `json:"payment_intent"`
			}
			_ = json.Unmarshal(b, &cs)
			if cs.ID != "" {
				_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET stripe_checkout_session_id=$1 WHERE id=$2", cs.ID, id)
			}
			if cs.PaymentIntent.ID != "" {
				_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET stripe_intent_id=$1 WHERE id=$2", cs.PaymentIntent.ID, id)
			}
			if cs.URL != "" {
				checkoutURL = cs.URL
			}
		}
	}
	if checkoutURL == "" {
		checkoutURL = "http://localhost:3000/my-booking?pt=" + url.QueryEscape(token) + "&bookingId=" + url.QueryEscape(id)
	}
	if s.email != nil {
		_ = s.email.SendBookingAcceptedEmail(guestEmail, emailpkg.BookingEmailData{Name: guestName, CheckIn: ci.Format("2006-01-02"), CheckOut: co.Format("2006-01-02"), Guests: guests, TotalPrice: total, PaymentLink: checkoutURL})
	}
	payMsg := map[string]any{"type": "payment_invite", "text": "Sua reserva foi aprovada! Para concluir, realize o pagamento.", "cta": "Pagar agora", "booking_id": id, "checkout_url": checkoutURL}
	msgStr, _ := json.Marshal(payMsg)
	_, _ = s.pool.Exec(r.Context(), "INSERT INTO messages (booking_id, sender_email, is_from_owner, message) VALUES ($1,$2,$3,$4)", id, c["email"], true, string(msgStr))
	payload, _ := json.Marshal(map[string]any{"type": "message", "data": map[string]any{"booking_id": id, "sender_email": c["email"], "is_from_owner": true, "message": string(msgStr), "created_at": time.Now().Format(time.RFC3339)}})
	s.hub.Broadcast(id, payload)
	if s.email != nil && guestEmail != "" {
		_ = s.email.SendChatNotificationEmail(guestEmail, emailpkg.ChatMessageEmailData{SenderName: "Ocean Haven", Message: "Sua reserva foi aprovada! Para pagar, acesse: " + checkoutURL, Timestamp: time.Now().Format(time.RFC3339)})
	}
	jsonResp(w, 200, map[string]string{"status": "approved"})
}

func (s *Server) handleReject(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	id := mux.Vars(r)["id"]
	if _, err := s.pool.Exec(r.Context(), "UPDATE bookings SET status='rejected', updated_at=now() WHERE id=$1", id); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResp(w, 200, map[string]string{"status": "rejected"})
}

func (s *Server) handlePostMessage(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var body struct{ BookingID, Message string }
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.BookingID == "" || body.Message == "" {
		jsonResp(w, 400, map[string]string{"error": "invalid_input"})
		return
	}
	var isOwner bool
	if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if !isOwner {
		var customerEmail, guestEmail string
		_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(u.email,''), COALESCE(b.guest_email,'') FROM bookings b LEFT JOIN users u ON b.customer_id=u.id WHERE b.id=$1", body.BookingID).Scan(&customerEmail, &guestEmail)
		email := fmt.Sprintf("%v", c["email"])
		if email != customerEmail && email != guestEmail {
			jsonResp(w, 403, map[string]string{"error": "forbidden"})
			return
		}
	}

	if _, err := s.pool.Exec(r.Context(), "INSERT INTO messages (booking_id, sender_email, is_from_owner, message) VALUES ($1,$2,$3,$4)", body.BookingID, c["email"], isOwner, body.Message); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if s.email != nil {
		var userEmail, guestEmail string
		_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(u.email,''), COALESCE(b.guest_email,'') FROM bookings b LEFT JOIN users u ON b.customer_id=u.id WHERE b.id=$1", body.BookingID).Scan(&userEmail, &guestEmail)
		var to string
		if isOwner {
			to = userEmail
		} else {
			var owner string
			_ = s.pool.QueryRow(r.Context(), "SELECT email FROM users WHERE is_owner=true ORDER BY created_at ASC LIMIT 1").Scan(&owner)
			if owner != "" {
				to = owner
			} else {
				to = guestEmail
			}
		}

		if to != "" {
			key := fmt.Sprintf("%s:%s", body.BookingID, to)
			if val, ok := s.chatTimers.Load(key); ok {
				if t, ok := val.(*time.Timer); ok {
					t.Stop()
				}
			}

			senderName := fmt.Sprintf("%v", c["email"])
			bookingID := body.BookingID

			timer := time.AfterFunc(3*time.Minute, func() {
				s.chatTimers.Delete(key)

				var targetLink string
				if isOwner {
					targetLink = fmt.Sprintf("http://localhost:3000/chat/%s", bookingID)
				} else {
					targetLink = fmt.Sprintf("http://localhost:3000/dashboard?booking_id=%s", bookingID)
				}

				_ = s.email.SendChatNotificationEmail(to, emailpkg.ChatMessageEmailData{
					SenderName: senderName,
					Message:    "Nova mensagem",
					Timestamp:  time.Now().Format(time.RFC3339),
					ChatLink:   targetLink,
				})
			})
			s.chatTimers.Store(key, timer)
		}
	}
	payload, _ := json.Marshal(map[string]any{"type": "message", "data": map[string]any{"booking_id": body.BookingID, "sender_email": c["email"], "is_from_owner": isOwner, "message": body.Message, "created_at": time.Now().Format(time.RFC3339)}})
	s.hub.Broadcast(body.BookingID, payload)
	jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleGetMessages(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	bookingID := r.URL.Query().Get("booking_id")
	if bookingID == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_booking_id"})
		return
	}
	var customerEmail, guestEmail, ownerEmail string
	_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(u.email,''), COALESCE(b.guest_email,''), COALESCE(o.email,'') FROM bookings b LEFT JOIN users u ON b.customer_id=u.id LEFT JOIN users o ON b.owner_id=o.id WHERE b.id=$1", bookingID).Scan(&customerEmail, &guestEmail, &ownerEmail)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	email := fmt.Sprintf("%v", c["email"])
	if !isOwner && email != customerEmail && email != guestEmail {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	rows, err := s.pool.Query(r.Context(), "SELECT id, booking_id, sender_email, is_from_owner, message, created_at FROM messages WHERE booking_id=$1 ORDER BY created_at ASC", bookingID)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	type rec struct {
		ID          int64     `json:"id"`
		BookingID   string    `json:"booking_id"`
		SenderEmail string    `json:"sender_id"`
		IsFromOwner bool      `json:"is_from_owner"`
		Message     string    `json:"message"`
		CreatedAt   time.Time `json:"created_at"`
	}
	var out []rec
	for rows.Next() {
		var a rec
		if err := rows.Scan(&a.ID, &a.BookingID, &a.SenderEmail, &a.IsFromOwner, &a.Message, &a.CreatedAt); err != nil {
			jsonResp(w, 500, map[string]string{"error": err.Error()})
			return
		}
		out = append(out, a)
	}
	if rows.Err() != nil {
		jsonResp(w, 500, map[string]string{"error": rows.Err().Error()})
		return
	}
	jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleDashboardStats(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	if err := s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var totalBookings int64
	var approvedBookings int64
	var totalRevenue float64
	var monthlyRevenue float64
	var pendingRequests int64
	if err := s.pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings").Scan(&totalBookings); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if err := s.pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings WHERE status='approved'").Scan(&approvedBookings); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if err := s.pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM bookings WHERE status='requested'").Scan(&pendingRequests); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if err := s.pool.QueryRow(r.Context(), "SELECT COALESCE(SUM(total_price)::float8, 0) FROM bookings WHERE status='paid'").Scan(&totalRevenue); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	if err := s.pool.QueryRow(r.Context(), "SELECT COALESCE(SUM(total_price)::float8, 0) FROM bookings WHERE status='paid' AND date_trunc('month', paid_at) = date_trunc('month', now())").Scan(&monthlyRevenue); err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	occ := s.computeMonthlyOccupancyRate()
	jsonResp(w, 200, map[string]any{"total_bookings": totalBookings, "approved_bookings": approvedBookings, "total_revenue": totalRevenue, "monthly_revenue": monthlyRevenue, "pending_requests": pendingRequests, "occupancy_rate": occ})
}

func (s *Server) computeMonthlyOccupancyRate() float64 {
	if s.icsCache == "" || time.Since(s.icsLastUpdated) > 10*time.Minute {
		s.refreshMergedICS(context.Background())
	}
	now := time.Now()
	loc := time.UTC
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	monthEnd := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, loc)
	busy := map[string]struct{}{}
	events := extractEventsFromICS(s.icsCache)
	for _, block := range events {
		dtstartLine := findLine(block, "DTSTART")
		dtendLine := findLine(block, "DTEND")
		if dtstartLine == "" || dtendLine == "" {
			continue
		}
		st := parseIcsTime(dtstartLine)
		en := parseIcsTime(dtendLine)
		if st.IsZero() || en.IsZero() {
			continue
		}
		endExclusive := en.Add(-24 * time.Hour)
		start := st
		if start.Before(monthStart) {
			start = monthStart
		}
		if endExclusive.After(monthEnd.Add(-24 * time.Hour)) {
			endExclusive = monthEnd.Add(-24 * time.Hour)
		}
		for cur := start; !cur.After(endExclusive); cur = cur.Add(24 * time.Hour) {
			key := cur.Format("2006-01-02")
			busy[key] = struct{}{}
		}
	}
	daysInMonth := int(monthEnd.Sub(monthStart).Hours() / 24)
	if daysInMonth <= 0 {
		return 0
	}
	rate := float64(len(busy)) / float64(daysInMonth) * 100.0
	return mathRound(rate, 0)
}

func findLine(block, prefix string) string {
	for _, ln := range strings.Split(block, "\n") {
		ln = strings.TrimSpace(ln)
		if strings.HasPrefix(ln, prefix) {
			return ln
		}
	}
	return ""
}

func parseIcsTime(line string) time.Time {
	parts := strings.Split(line, ":")
	if len(parts) < 2 {
		return time.Time{}
	}
	val := strings.TrimSpace(parts[1])
	if len(val) == 8 {
		y, _ := strconv.Atoi(val[0:4])
		m, _ := strconv.Atoi(val[4:6])
		d, _ := strconv.Atoi(val[6:8])
		return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
	}
	if strings.HasSuffix(val, "Z") && len(val) >= 15 {
		y, _ := strconv.Atoi(val[0:4])
		m, _ := strconv.Atoi(val[4:6])
		d, _ := strconv.Atoi(val[6:8])
		return time.Date(y, time.Month(m), d, 0, 0, 0, 0, time.UTC)
	}
	t, _ := time.Parse(time.RFC3339, val)
	return t
}

func mathRound(x float64, prec int) float64 {
	p := mathPow10(prec)
	if x >= 0 {
		return float64(int64(x*p+0.5)) / p
	}
	return float64(int64(x*p-0.5)) / p
}

func mathPow10(n int) float64 {
	v := 1.0
	for i := 0; i < n; i++ {
		v *= 10
	}
	return v
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
  owner_id UUID,
  customer_id UUID,
  status TEXT,
  check_in TIMESTAMP,
  check_out TIMESTAMP,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  number_of_guests INT,
  total_price NUMERIC,
  stripe_intent_id TEXT,
  stripe_checkout_session_id TEXT,
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
CREATE TABLE IF NOT EXISTS date_prices (
  date DATE PRIMARY KEY,
  price NUMERIC NOT NULL,
  updated_at TIMESTAMP DEFAULT now()
);
`)
	_, err := pool.Exec(ctx, `
ALTER TABLE users ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE users SET id = gen_random_uuid() WHERE id IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_id_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_id_unique UNIQUE (id);
  END IF;
END $$;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS subtotal_price NUMERIC;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount NUMERIC;
ALTER TABLE icals ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_intent_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_token TEXT;
`)
	if err != nil {
		log.Printf("Erro na migração de colunas: %v", err)
	}

	_, err = pool.Exec(ctx, `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='user_email') THEN
    UPDATE bookings b SET customer_id = u.id FROM users u WHERE b.user_email = u.email AND b.customer_id IS NULL;
  END IF;
END $$;
UPDATE bookings b SET owner_id = u.id FROM users u WHERE u.is_owner = true AND b.owner_id IS NULL;
`)
	if err != nil {
		log.Printf("Erro na migração de dados: %v", err)
	}

	_, err = pool.Exec(ctx, `
ALTER TABLE bookings DROP COLUMN IF EXISTS user_email;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_customer_fk'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_customer_fk FOREIGN KEY (customer_id)
      REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_owner_fk'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_owner_fk FOREIGN KEY (owner_id)
      REFERENCES users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;
`)
	if err != nil {
		log.Printf("Erro na migração de chaves estrangeiras: %v", err)
	}
}

func (s *Server) handleAddBlock(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var body struct {
		From, To string
		Note     string
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.From == "" || body.To == "" {
		jsonResp(w, 400, map[string]string{"error": "invalid_input"})
		return
	}
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
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	rows, _ := s.pool.Query(r.Context(), "SELECT id, from_ts, to_ts, note, created_at FROM blocks ORDER BY from_ts DESC")
	type rec struct {
		ID        int64
		From      time.Time
		To        time.Time
		Note      string
		CreatedAt time.Time
	}
	var out []rec
	for rows.Next() {
		var a rec
		_ = rows.Scan(&a.ID, &a.From, &a.To, &a.Note, &a.CreatedAt)
		out = append(out, a)
	}
	jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handleUnblockRange(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var body struct{ From, To string }
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.From == "" || body.To == "" {
		jsonResp(w, 400, map[string]string{"error": "invalid_input"})
		return
	}
	var from, to time.Time
	from, _ = time.Parse(time.RFC3339, body.From)
	to, _ = time.Parse(time.RFC3339, body.To)
	// Delete any block overlapping the range
	_, _ = s.pool.Exec(r.Context(), "DELETE FROM blocks WHERE NOT (to_ts < $1 OR from_ts > $2)", from, to)
	jsonResp(w, 200, map[string]bool{"success": true})
}

type Hub struct {
	sync.RWMutex
	rooms map[string]map[*websocket.Conn]struct{}
}

func NewHub() *Hub { return &Hub{rooms: make(map[string]map[*websocket.Conn]struct{})} }
func (h *Hub) Add(room string, c *websocket.Conn) {
	h.Lock()
	defer h.Unlock()
	if _, ok := h.rooms[room]; !ok {
		h.rooms[room] = make(map[*websocket.Conn]struct{})
	}
	h.rooms[room][c] = struct{}{}
}
func (h *Hub) Remove(room string, c *websocket.Conn) {
	h.Lock()
	defer h.Unlock()
	if m, ok := h.rooms[room]; ok {
		delete(m, c)
		if len(m) == 0 {
			delete(h.rooms, room)
		}
	}
}
func (h *Hub) Broadcast(room string, payload []byte) {
	h.RLock()
	connsMap, ok := h.rooms[room]
	if !ok {
		h.RUnlock()
		return
	}
	// Copy connections to safely iterate without holding lock
	var conns []*websocket.Conn
	for c := range connsMap {
		conns = append(conns, c)
	}
	h.RUnlock()

	var dead []*websocket.Conn
	for _, c := range conns {
		_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
		if err := c.WriteMessage(websocket.TextMessage, payload); err != nil {
			dead = append(dead, c)
		}
	}

	if len(dead) > 0 {
		h.Lock()
		if m, ok := h.rooms[room]; ok {
			for _, c := range dead {
				delete(m, c)
				c.Close()
			}
			if len(m) == 0 {
				delete(h.rooms, room)
			}
		}
		h.Unlock()
	}
}

func (s *Server) handleWSMessages(w http.ResponseWriter, r *http.Request) {
	bookingID := r.URL.Query().Get("booking_id")
	tokenStr := r.URL.Query().Get("token")
	if bookingID == "" || tokenStr == "" {
		http.Error(w, "missing params", http.StatusBadRequest)
		return
	}
	tkn, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) { return []byte(s.jwtSecret), nil })
	if err != nil || !tkn.Valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	claims, ok := tkn.Claims.(jwt.MapClaims)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", claims["email"]).Scan(&isOwner)
	var customerEmail, guestEmail string
	_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(u.email,''), COALESCE(b.guest_email,'') FROM bookings b LEFT JOIN users u ON b.customer_id=u.id WHERE b.id=$1", bookingID).Scan(&customerEmail, &guestEmail)
	email := fmt.Sprintf("%v", claims["email"])
	if !isOwner && email != customerEmail && email != guestEmail {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade error:", err)
		http.Error(w, "upgrade_failed", http.StatusInternalServerError)
		return
	}
	s.hub.Add(bookingID, conn)
	// Optional: send a hello message
	_ = conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"hello"}`))
	go func() {
		defer func() { s.hub.Remove(bookingID, conn); conn.Close() }()
		for {
			// Read and discard client messages (we only push server events)
			if _, _, err := conn.ReadMessage(); err != nil {
				break
			}
		}
	}()
}

func main() {
	_ = godotenv.Load()
	dsn := os.Getenv("PG_DSN")
	if dsn == "" {
		log.Fatal("PG_DSN não definido no .env")
	}
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "dev-secret"
	}
	cfg, _ := pgxpool.ParseConfig(dsn)
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		panic(err)
	}
	ensureSchema(context.Background(), pool)
	if _, err := pool.Exec(context.Background(), "SELECT 1"); err == nil {
		log.Println("Conexão com o banco de dados estabelecida com sucesso")
	}
	stripeSecret := os.Getenv("STRIPE_SECRET_KEY")
	stripePublic := os.Getenv("STRIPE_PUBLIC_KEY")
	s := &Server{pool: pool, jwtSecret: secret, hub: NewHub(), stripeSecret: stripeSecret, stripePublic: stripePublic}
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
			if reqHeaders == "" {
				reqHeaders = "Authorization, Content-Type"
			}
			w.Header().Set("Access-Control-Allow-Headers", reqHeaders)
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
			if req.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
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
	r.HandleFunc("/bookings/calculate", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.HandleFunc("/bookings/mine", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.HandleFunc("/bookings/{id}/approve", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.HandleFunc("/bookings/{id}/reject", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.HandleFunc("/messages", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.HandleFunc("/ws/messages", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.HandleFunc("/calendar/merged.ics", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.HandleFunc("/stats/dashboard", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) }).Methods(http.MethodOptions)
	r.MethodNotAllowedHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		origin := req.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		reqHeaders := req.Header.Get("Access-Control-Request-Headers")
		if reqHeaders == "" {
			reqHeaders = "Authorization, Content-Type"
		}
		w.Header().Set("Access-Control-Allow-Headers", reqHeaders)
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		if req.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
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
		if to == "" {
			jsonResp(w, 400, map[string]string{"error": "missing_to"})
			return
		}
		subject := r.URL.Query().Get("subject")
		if subject == "" {
			subject = "Teste Resend"
		}
		html := r.URL.Query().Get("html")
		text := r.URL.Query().Get("text")
		if html == "" && text == "" {
			html = emailpkg.AccountConfirmationTemplate(emailpkg.AccountConfirmationData{Name: "Teste", VerificationLink: "https://example.com/verify"})
		}
		if s.email == nil {
			jsonResp(w, 500, map[string]string{"error": "missing_api_key"})
			return
		}
		if err := s.email.SendRawEmail(to, subject, html, text); err != nil {
			jsonResp(w, 500, map[string]string{"error": err.Error()})
			return
		}
		jsonResp(w, 200, map[string]bool{"sent": true})
	}).Methods("GET")
	r.HandleFunc("/settings/public", s.handleGetSettingsPublic).Methods("GET")
	r.Handle("/date-prices", s.authMiddleware(http.HandlerFunc(s.handleGetDatePrices))).Methods("GET")
	r.Handle("/date-prices", s.authMiddleware(http.HandlerFunc(s.handlePutDatePrice))).Methods("PUT")
	r.Handle("/date-prices/{date}", s.authMiddleware(http.HandlerFunc(s.handleDeleteDatePrice))).Methods("DELETE")
	r.Handle("/date-prices/bulk", s.authMiddleware(http.HandlerFunc(s.handlePutDatePriceBulk))).Methods("PUT")
	r.HandleFunc("/bookings", s.handleCreateBooking).Methods("POST")
	r.HandleFunc("/bookings/calculate", s.handleCalculatePrice).Methods("POST")
	r.Handle("/bookings", s.authMiddleware(http.HandlerFunc(s.handleListBookingsOwner))).Methods("GET")
	r.Handle("/bookings/mine", s.authMiddleware(http.HandlerFunc(s.handleListBookingsMine))).Methods("GET")
	r.Handle("/bookings/{id}/approve", s.authMiddleware(http.HandlerFunc(s.handleApprove))).Methods("POST")
	r.Handle("/bookings/{id}/reject", s.authMiddleware(http.HandlerFunc(s.handleReject))).Methods("POST")
	r.HandleFunc("/bookings/{id}/payment-intent", s.handleCreatePaymentIntent).Methods("POST")
	r.HandleFunc("/bookings/{id}/checkout", s.handleCreateCheckoutSession).Methods("POST")
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
	if port == "" {
		port = "3005"
	}
	log.Printf("Servidor iniciado na porta %s", port)
	http.ListenAndServe(":"+port, r)
}
func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
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
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var body struct {
		PropertyName    string
		CheckinTime     string
		CheckoutTime    string
		BasePrice       float64
		WeekendPrice    float64
		CleaningFee     float64
		ServiceFee      float64
		DiscountWeekly  float64
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

func (s *Server) handleGetDatePrices(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	var rows pgx.Rows
	var err error
	if start != "" && end != "" {
		var st, en time.Time
		st, _ = time.Parse("2006-01-02", start)
		en, _ = time.Parse("2006-01-02", end)
		rows, err = s.pool.Query(r.Context(), "SELECT date, COALESCE(price,0)::float8 FROM date_prices WHERE date >= $1 AND date <= $2 ORDER BY date ASC", st, en)
	} else {
		rows, err = s.pool.Query(r.Context(), "SELECT date, COALESCE(price,0)::float8 FROM date_prices ORDER BY date ASC")
	}
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	type rec struct {
		Date  time.Time `json:"date"`
		Price float64   `json:"price"`
	}
	var out []rec
	for rows.Next() {
		var d time.Time
		var p float64
		_ = rows.Scan(&d, &p)
		out = append(out, rec{Date: d, Price: p})
	}
	jsonResp(w, 200, map[string]any{"data": out})
}

func (s *Server) handlePutDatePrice(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var body struct {
		Date  string
		Price float64
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Date == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_date"})
		return
	}
	var dt time.Time
	dt, _ = time.Parse("2006-01-02", body.Date)
	_, err := s.pool.Exec(r.Context(), "INSERT INTO date_prices (date, price, updated_at) VALUES ($1,$2,now()) ON CONFLICT (date) DO UPDATE SET price=EXCLUDED.price, updated_at=now()", dt, body.Price)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handleDeleteDatePrice(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	dateStr := mux.Vars(r)["date"]
	if dateStr == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_date"})
		return
	}
	var dt time.Time
	dt, _ = time.Parse("2006-01-02", dateStr)
	_, err := s.pool.Exec(r.Context(), "DELETE FROM date_prices WHERE date=$1", dt)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	jsonResp(w, 200, map[string]bool{"success": true})
}

func (s *Server) handlePutDatePriceBulk(w http.ResponseWriter, r *http.Request) {
	c := getClaims(r)
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	if !isOwner {
		jsonResp(w, 403, map[string]string{"error": "forbidden"})
		return
	}
	var body struct {
		Dates []string
		Price float64
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if len(body.Dates) == 0 {
		jsonResp(w, 400, map[string]string{"error": "missing_dates"})
		return
	}
	cnt := 0
	for _, ds := range body.Dates {
		if strings.TrimSpace(ds) == "" {
			continue
		}
		dt, err := time.Parse("2006-01-02", ds)
		if err != nil {
			continue
		}
		if _, err := s.pool.Exec(r.Context(), "INSERT INTO date_prices (date, price, updated_at) VALUES ($1,$2,now()) ON CONFLICT (date) DO UPDATE SET price=EXCLUDED.price, updated_at=now()", dt, body.Price); err == nil {
			cnt++
		}
	}
	jsonResp(w, 200, map[string]int{"updated": cnt})
}

func (s *Server) handleCreatePaymentIntent(w http.ResponseWriter, r *http.Request) {
	var c jwt.MapClaims
	hdr := r.Header.Get("Authorization")
	if strings.HasPrefix(hdr, "Bearer ") {
		tokenStr := strings.TrimPrefix(hdr, "Bearer ")
		if tkn, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) { return []byte(s.jwtSecret), nil }); err == nil && tkn.Valid {
			if cl, ok := tkn.Claims.(jwt.MapClaims); ok {
				c = cl
			}
		}
	}
	id := mux.Vars(r)["id"]
	if id == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_id"})
		return
	}
	if s.stripeSecret == "" {
		jsonResp(w, 500, map[string]string{"error": "stripe_not_configured"})
		return
	}
	var customerEmail, status string
	var total float64
	var guestEmail, guestName string
	var paymentToken string
	err := s.pool.QueryRow(r.Context(), "SELECT COALESCE(u.email,''), COALESCE(b.status,'requested'), COALESCE(b.total_price,0)::float8, COALESCE(b.guest_email,''), COALESCE(b.guest_name,''), COALESCE(b.payment_token,'') FROM bookings b LEFT JOIN users u ON b.customer_id=u.id WHERE b.id=$1", id).Scan(&customerEmail, &status, &total, &guestEmail, &guestName, &paymentToken)
	if err != nil {
		jsonResp(w, 404, map[string]string{"error": "booking_not_found"})
		return
	}
	// Allow access if valid payment token provided or user is owner/customer
	pt := r.URL.Query().Get("pt")
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	email := fmt.Sprintf("%v", c["email"])
	if pt == "" {
		if !isOwner && email != customerEmail && email != guestEmail {
			jsonResp(w, 403, map[string]string{"error": "forbidden"})
			return
		}
	} else {
		if pt != paymentToken {
			jsonResp(w, 403, map[string]string{"error": "invalid_token"})
			return
		}
	}
	if status != "approved" {
		jsonResp(w, 409, map[string]string{"error": "booking_not_approved"})
		return
	}
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
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		jsonResp(w, resp.StatusCode, map[string]any{"error": "stripe_error", "body": string(body)})
		return
	}
	var si struct {
		ID           string `json:"id"`
		ClientSecret string `json:"client_secret"`
	}
	_ = json.Unmarshal(body, &si)
	if si.ID != "" {
		_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET stripe_intent_id=$1 WHERE id=$2", si.ID, id)
	}
	jsonResp(w, 200, map[string]any{"client_secret": si.ClientSecret, "publishable_key": s.stripePublic})
}

func (s *Server) handleCreateCheckoutSession(w http.ResponseWriter, r *http.Request) {
	var c jwt.MapClaims
	hdr := r.Header.Get("Authorization")
	if strings.HasPrefix(hdr, "Bearer ") {
		tokenStr := strings.TrimPrefix(hdr, "Bearer ")
		if tkn, err := jwt.Parse(tokenStr, func(token *jwt.Token) (any, error) { return []byte(s.jwtSecret), nil }); err == nil && tkn.Valid {
			if cl, ok := tkn.Claims.(jwt.MapClaims); ok {
				c = cl
			}
		}
	}
	id := mux.Vars(r)["id"]
	if id == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_id"})
		return
	}
	if s.stripeSecret == "" {
		jsonResp(w, 500, map[string]string{"error": "stripe_not_configured"})
		return
	}
	var customerEmail, status string
	var total float64
	var guestEmail, guestName string
	var paymentToken string
	err := s.pool.QueryRow(r.Context(), "SELECT COALESCE(u.email,''), COALESCE(b.status,'requested'), COALESCE(b.total_price,0)::float8, COALESCE(b.guest_email,''), COALESCE(b.guest_name,''), COALESCE(b.payment_token,'') FROM bookings b LEFT JOIN users u ON b.customer_id=u.id WHERE b.id=$1", id).Scan(&customerEmail, &status, &total, &guestEmail, &guestName, &paymentToken)
	if err != nil {
		jsonResp(w, 404, map[string]string{"error": "booking_not_found"})
		return
	}
	// Allow if owner or customer, or with payment token
	pt := r.URL.Query().Get("pt")
	var isOwner bool
	_ = s.pool.QueryRow(r.Context(), "SELECT is_owner FROM users WHERE email=$1", c["email"]).Scan(&isOwner)
	email := fmt.Sprintf("%v", c["email"])
	if pt == "" {
		if !isOwner && email != customerEmail && email != guestEmail {
			jsonResp(w, 403, map[string]string{"error": "forbidden"})
			return
		}
	} else {
		if pt != paymentToken {
			jsonResp(w, 403, map[string]string{"error": "invalid_token"})
			return
		}
	}
	if status != "approved" {
		jsonResp(w, 409, map[string]string{"error": "booking_not_approved"})
		return
	}
	amount := int64(total * 100)
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", "http://localhost:3000/my-booking?payment=success&booking_id="+url.QueryEscape(id))
	form.Set("cancel_url", "http://localhost:3000/my-booking?payment=cancel&booking_id="+url.QueryEscape(id))
	form.Set("line_items[0][price_data][currency]", "brl")
	form.Set("line_items[0][price_data][product_data][name]", "Reserva "+guestName)
	form.Set("line_items[0][price_data][unit_amount]", fmt.Sprintf("%d", amount))
	form.Set("line_items[0][quantity]", "1")
	form.Set("metadata[booking_id]", id)
	req, _ := http.NewRequest("POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
	req.Header.Set("Authorization", "Bearer "+s.stripeSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		jsonResp(w, resp.StatusCode, map[string]any{"error": "stripe_error", "body": string(body)})
		return
	}
	var cs struct {
		ID            string              `json:"id"`
		URL           string              `json:"url"`
		PaymentIntent struct{ ID string } `json:"payment_intent"`
	}
	_ = json.Unmarshal(body, &cs)
	if cs.ID != "" {
		_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET stripe_checkout_session_id=$1 WHERE id=$2", cs.ID, id)
	}
	if cs.PaymentIntent.ID != "" {
		_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET stripe_intent_id=$1 WHERE id=$2", cs.PaymentIntent.ID, id)
	}
	jsonResp(w, 200, map[string]any{"url": cs.URL})
}

func (s *Server) handleMarkPaid(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	if id == "" {
		jsonResp(w, 400, map[string]string{"error": "missing_id"})
		return
	}
	if s.stripeSecret == "" {
		jsonResp(w, 500, map[string]string{"error": "stripe_not_configured"})
		return
	}
	var intentID string
	_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(stripe_intent_id,'') FROM bookings WHERE id=$1", id).Scan(&intentID)
	if intentID == "" {
		jsonResp(w, 409, map[string]string{"error": "no_intent"})
		return
	}
	req, _ := http.NewRequest("GET", "https://api.stripe.com/v1/payment_intents/"+intentID, nil)
	req.Header.Set("Authorization", "Bearer "+s.stripeSecret)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		jsonResp(w, 500, map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var si struct {
		Status string `json:"status"`
	}
	_ = json.Unmarshal(body, &si)
	if si.Status == "succeeded" {
		_, _ = s.pool.Exec(r.Context(), "UPDATE bookings SET status='paid', paid_at=now(), updated_at=now() WHERE id=$1", id)
		var guestEmail, guestName string
		var total float64
		var ownerEmail string
		_ = s.pool.QueryRow(r.Context(), "SELECT COALESCE(b.guest_email,''), COALESCE(b.guest_name,''), COALESCE(b.total_price,0)::float8, COALESCE(u.email,'') FROM bookings b LEFT JOIN users u ON b.owner_id=u.id WHERE b.id=$1", id).Scan(&guestEmail, &guestName, &total, &ownerEmail)
		if s.email != nil {
			if guestEmail != "" {
				_ = s.email.SendPaymentConfirmationEmail(guestEmail, emailpkg.PaymentEmailData{Name: guestName, Amount: total, Date: time.Now().Format(time.RFC3339), ReservationID: id})
			}
			if ownerEmail != "" {
				_ = s.email.SendRawEmail(ownerEmail, "Reserva paga", fmt.Sprintf("<p>A reserva %s foi paga por %s.</p><p>Total: R$ %.2f</p>", id, guestName, total), "")
			}
		}
		jsonResp(w, 200, map[string]bool{"paid": true})
		return
	}
	jsonResp(w, 200, map[string]any{"paid": false, "status": si.Status})
}
