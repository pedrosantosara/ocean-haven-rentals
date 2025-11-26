package main

import (
    "fmt"
    "log"
    "os"
    "github.com/resend/resend-go/v3"
)

func main() {
    apiKey := os.Getenv("RESEND_API_KEY")
    if apiKey == "" { log.Fatal("RESEND_API_KEY não definida") }
    from := os.Getenv("RESEND_FROM")
    if from == "" { from = "admin@mbvacationhomes.com.br" }
    to := "tmelo8406@gmail.com"
    client := resend.NewClient(apiKey)
    params := &resend.SendEmailRequest{ From: from, To: []string{to}, Subject: "Teste via Resend + Go", Text: "Funcionou!" }
    sent, err := client.Emails.Send(params)
    if err != nil { log.Fatalf("Erro ao enviar email: %v", err) }
    fmt.Printf("Email enviado. ID: %s\n", sent.Id)
}