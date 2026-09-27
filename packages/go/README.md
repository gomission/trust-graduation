# Go Module

Module: `github.com/trust-graduation/protocol-go`.

This Go alpha is an incomplete planning-only port. It does not authorize approval-gated or unknown action classes, even when a request carries an approved flag. Use the current JavaScript provider gate for exact-action execution.

```go
tg := trustgraduation.New("user-123", ledger)
decision := tg.CanExecute(trustgraduation.Request{ActionClass: "email.send.external"})
```
