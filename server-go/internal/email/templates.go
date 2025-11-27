package email

import "fmt"

func baseTemplate(title, body string) string {
	return fmt.Sprintf(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"/><title>%s</title><style>body{margin:0;padding:0;background:#0b1f2a;color:#0e2433;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","Apple Color Emoji","Segoe UI Emoji"} .wrap{max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 30px rgba(0,0,0,.18)} .hero{background:linear-gradient(135deg,#0ea5e9,#0b5c7a);color:#fff;padding:24px} .brand{font-weight:800;letter-spacing:.5px} .content{padding:24px} .btn{display:inline-block;padding:12px 18px;border-radius:999px;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:600} .muted{color:#5b6b7b} .box{border:1px solid rgba(14,165,233,.15);border-radius:12px;padding:16px;background:#f8fbfd} .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace} @media (max-width:480px){.content{padding:18px}.hero{padding:18px}}</style></head><body><div class="wrap"><div class="hero"><div class="brand">Casa Pura Vida</div><div style="margin-top:8px;font-size:18px;font-weight:700">%s</div></div><div class="content">%s<div style="margin-top:24px" class="muted">© Casa Pura Vida • Maragogi</div></div></div></body></html>`, title, title, body)
}

func AccountConfirmationTemplate(data AccountConfirmationData) string {
	body := fmt.Sprintf(`<p>Olá, %s!</p><p>Bem-vindo. Para concluir seu cadastro, confirme seu email.</p><p><a class="btn" href="%s" target="_blank" rel="noopener">Confirmar email</a></p><p class="muted">Se você não solicitou, ignore este email.</p>`, data.Name, data.VerificationLink)
	return baseTemplate("Confirmar email", body)
}

func TwoFactorTemplate(data TwoFactorData) string {
	body := fmt.Sprintf(`<p>Olá, %s!</p><p>Use o código abaixo para entrar com verificação em duas etapas.</p><div class="box mono" style="font-size:22px">%s</div><p class="muted">O código expira em alguns minutos.</p>`, data.Name, data.Code)
	return baseTemplate("Seu código 2FA", body)
}

func PaymentConfirmationTemplate(data PaymentEmailData) string {
	body := fmt.Sprintf(`<p>Olá, %s!</p><p>Pagamento confirmado.</p><div class="box"><div><strong>Valor:</strong> R$ %.2f</div><div><strong>Data:</strong> %s</div><div><strong>Reserva:</strong> %s</div></div><p>Agradecemos a preferência.</p>`, data.Name, data.Amount, data.Date, data.ReservationID)
	return baseTemplate("Pagamento confirmado", body)
}

func BookingAcceptedTemplate(data BookingEmailData) string {
	cta := ""
	if data.PaymentLink != "" {
		cta = fmt.Sprintf(`<p style="margin-top:16px"><a href="%s" style="display:inline-block;padding:12px 18px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none">Confirmar pagamento</a></p>`, data.PaymentLink)
	}
	body := fmt.Sprintf(`<p>Olá, %s!</p><p>Sua hospedagem foi confirmada.</p><div class="box"><div><strong>Check-in:</strong> %s</div><div><strong>Check-out:</strong> %s</div><div><strong>Hóspedes:</strong> %d</div><div><strong>Total:</strong> R$ %.2f</div></div>%s<p>Prepare-se para dias de praia e conforto.</p>`, data.Name, data.CheckIn, data.CheckOut, data.Guests, data.TotalPrice, cta)
	return baseTemplate("Reserva confirmada", body)
}

func BookingCancelledTemplate(data BookingEmailData) string {
    body := fmt.Sprintf(`<p>Olá, %s!</p><p>Sua hospedagem foi cancelada.</p><div class="box"><div><strong>Check-in:</strong> %s</div><div><strong>Check-out:</strong> %s</div><div><strong>Hóspedes:</strong> %d</div><div><strong>Total:</strong> R$ %.2f</div></div><p>As datas foram liberadas para novas reservas. Se tiver dúvidas, responda este email.</p>`, data.Name, data.CheckIn, data.CheckOut, data.Guests, data.TotalPrice)
    return baseTemplate("Reserva cancelada", body)
}

func ChatNotificationTemplate(data ChatMessageEmailData) string {
	linkBtn := ""
	if data.ChatLink != "" {
		linkBtn = fmt.Sprintf(`<p style="margin-top:16px"><a href="%s" class="btn">Ir para o Chat</a></p>`, data.ChatLink)
	}
	body := fmt.Sprintf(`<p>Você tem novas mensagens no chat de %s.</p>%s<p class="muted">Acesse a plataforma para responder.</p>`, data.SenderName, linkBtn)
	return baseTemplate("Novas mensagens no chat", body)
}
