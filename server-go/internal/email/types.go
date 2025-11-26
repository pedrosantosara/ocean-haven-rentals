package email

type BookingEmailData struct {
	Name        string
	CheckIn     string
	CheckOut    string
	Guests      int
	TotalPrice  float64
	PaymentLink string
}

type PaymentEmailData struct {
	Name          string
	Amount        float64
	Date          string
	ReservationID string
}

type ChatMessageEmailData struct {
	SenderName string
	Message    string
	Timestamp  string
	ChatLink   string
}

type AccountConfirmationData struct {
	Name             string
	VerificationLink string
}

type TwoFactorData struct {
	Name string
	Code string
}
