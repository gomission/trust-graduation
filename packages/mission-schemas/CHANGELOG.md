# Changelog

## 0.1.1 — 2026-09-27

- Validate the exact request payload against action, grant, decision-v2, and
  receipt input commitments in cross-object conformance checks.
- Distinguish missing input from an explicitly approved JSON null value.
- Keep provider result evidence separate from request input commitments.
- Clarify that signature verification and trusted-key selection remain the
  host's responsibility.
- Add adversarial receipt-chain coverage and private security-reporting guidance.
- Preserve existing schema identifiers and the shape-only validator API.
