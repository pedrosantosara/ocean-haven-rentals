package main

import (
    "context"
    "fmt"
    "log"
    "os"

    "github.com/resend/resend-go/v3"
)

func main() {
    apiKey := os.Getenv("RESEND_API_KEY")
    if apiKey == "" {
        log.Fatal("A variável RESEND_API_KEY não está definida.")
    }

    from := os.Getenv("RESEND_FROM")
    if from == "" {
        log.Fatal("A variável RESEND_FROM não está definida.")
    }

    client := resend.NewClient(apiKey)

    params := &resend.SendEmailRequest{
        From:    from,
        To:      []string{"tmelo8406@gmail.com"}, // <- AQUI VOCÊ TESTA
        Subject: "Teste via Resend + Go",
        Html:    "<h1>Funcionou</h1><p>Email enviado com sucesso 🌴</p>",
    }

    fmt.Println("Enviando para:", params.To)

    sent, err := client.Emails.Send(context.Background(), params)
    if err != nil {
        log.Fatalf("Erro ao enviar email: %v", err)
    }

    fmt.Printf("Email enviado com ID: %s\n", sent.Id)
}
