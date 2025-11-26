package email

import (
    "os"
    "github.com/resend/resend-go/v3"
)

func NewResendClient() *resend.Client {
    return resend.NewClient(os.Getenv("RESEND_API_KEY"))
}