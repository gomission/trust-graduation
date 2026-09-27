# Python Port

Package: `trust-graduation`.

This Python alpha is an incomplete planning-only port. It does not authorize approval-gated or unknown action classes, even when a request carries an approved flag. Use the current JavaScript provider gate for exact-action execution.

```python
from trust_graduation import TrustGraduation

tg = TrustGraduation(workspace="user-123", evidence=local_ledger)
decision = tg.can_execute({"actionClass": "email.send.external"})
```
