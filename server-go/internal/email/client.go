package email

import (
    "os"
    "github.com/resend/resend-go/v3"
)

func NewResendClient() *resend.Client {
    apiKey := os.Getenv("RESEND_API_KEY")
    if apiKey == "" {
        return nil
    }
    return resend.NewClient(apiKey)
}