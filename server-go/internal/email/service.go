package email

import (
    "errors"
    "os"
    "github.com/resend/resend-go/v3"
)

type EmailService struct {
    client *resend.Client
}

func NewEmailService(client *resend.Client) *EmailService {
    return &EmailService{client: client}
}

func (s *EmailService) send(to string, subject string, html string) error {
    if s.client == nil {
        return errors.New("email client not initialized")
    }
        from := os.Getenv("RESEND_FROM")
    if from == "" {
        // OBRIGATÓRIO: email do domínio verificado !!!
        from = "MB Vacation Homes <contato@mb.vacationhomes.com.br>"
    }
    params := &resend.SendEmailRequest{
        From:    from,
        To:      []string{to},
        Html:    html,
        Subject: subject,
    }
    _, err := s.client.Emails.Send(params)
    return err
}

func (s *EmailService) SendAccountConfirmationEmail(to string, data AccountConfirmationData) error {
    return s.send(to, "Confirmar email", AccountConfirmationTemplate(data))
}

func (s *EmailService) SendTwoFactorEmail(to string, data TwoFactorData) error {
    return s.send(to, "Seu código 2FA", TwoFactorTemplate(data))
}

func (s *EmailService) SendPaymentConfirmationEmail(to string, data PaymentEmailData) error {
    return s.send(to, "Pagamento confirmado", PaymentConfirmationTemplate(data))
}

func (s *EmailService) SendBookingAcceptedEmail(to string, data BookingEmailData) error {
    return s.send(to, "Reserva confirmada", BookingAcceptedTemplate(data))
}

func (s *EmailService) SendChatNotificationEmail(to string, data ChatMessageEmailData) error {
    return s.send(to, "Nova mensagem no chat", ChatNotificationTemplate(data))
}

func (s *EmailService) SendRawEmail(to, subject, html, text string) error {
    if s.client == nil {
        return errors.New("email client not initialized")
    }
    from := os.Getenv("RESEND_FROM")
    if from == "" {
        from = "admin@mbvacationhomes.com.br"
    }
    params := &resend.SendEmailRequest{ From: from, To: []string{to}, Subject: subject }
    if html != "" { params.Html = html }
    if text != "" { params.Text = text }
    _, err := s.client.Emails.Send(params)
    return err
}