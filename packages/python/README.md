# Python Port

Package: `trust-graduation`.

The Python alpha preserves the JavaScript decision contract for the minimal embed:

```python
from trust_graduation import TrustGraduation

tg = TrustGraduation(workspace="user-123", evidence=local_ledger)
decision = tg.can_execute({"actionClass": "email.send.external"})
```
