# Trust Graduation 1.0 Deep Dive

Status: alpha draft

## Artifacts

Trust Graduation 1.0 defines four portable payloads:

- Action class policy
- Evidence event
- Decision
- Approval packet

Schemas live in `schemas/v1/`.

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

