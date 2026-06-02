# Trust Graduation 1.0 Deep Dive

Status: alpha draft

## Artifacts

Trust Graduation 1.0 defines four core autonomy payloads:

- Action class policy
- Evidence event
- Decision
- Approval packet

Schemas live in `schemas/v1/`.

The reference implementation also defines a license entitlement payload. It is not an autonomy payload and cannot make an action executable; it only gates product/protocol capabilities such as package features, schema access, approval-packet rendering, local evidence helpers, and future federation.

## Evidence Tiers

The reference implementation maps evidence into four tiers:

| Tier | Rule |
|---|---|
| gated | Default until evidence is strong enough. |
| supervised | At least 5 positive events, 3 approvals, no negative evidence, low edit distance. |
| auto_capped | At least 10 positive events, 6 approvals, no negative evidence, very low edit distance. |
| review | Any trust issue, repeated rejections, rollback, or high rejection rate. |

## Decision Contract

`canExecute()` returns:

- `allowed`: whether the agent can execute now
- `needsApproval`: whether a human approval packet is required
- `mode`: current handling mode
- `autonomyLevel`: earned level from 0-5
- `tier`: evidence tier
- `policy`: action class policy
- `evidence`: evidence summary
- `packet`: standard approval payload when needed

## Federation Boundary

Federated evidence is not implemented in this alpha package. The package is designed so an optional hosted federation layer can provide the same evidence array from multiple products with user consent.

## License Entitlement Contract

Alpha entitlement tokens use the prefix `tg1` and encode a JSON payload matching `schemas/v1/license-token.schema.json`.

Required fields:

- `version`
- `issuer`
- `subject`
- `product`
- `plan`
- `features`
- `modules`

Default free local protocol features are `core`, `schemas`, `approval-packets`, and `local-evidence`. The entitlement layer is deliberately separate from `canExecute()` so monetization cannot accidentally bypass Trust Graduation.
