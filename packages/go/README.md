# Go Module

Module: `github.com/trust-graduation/protocol-go`.

The Go alpha preserves the JavaScript decision contract for the minimal embed.

```go
tg := trustgraduation.New("user-123", ledger)
decision := tg.CanExecute(trustgraduation.Request{ActionClass: "email.send.external"})
```
