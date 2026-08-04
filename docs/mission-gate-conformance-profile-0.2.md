# Mission Gate Conformance Profile 0.2

Status: beta implementation profile

Updated: 2026-08-04

This profile records the machine-readable contract implemented by the current Mission Gate runtime. It extends the portable Trust Graduation v0.1 method without redefining the v0.1 objects or promising that every Trust Graduation implementation uses Mission's product envelope.

## Current objects

The canonical identifiers are exported from `packages/mission-schemas/src/versions.mjs`:

- `mission-action/v1`
- `mission-grant/v1`
- `mission-decision/v1` and `mission-decision/v2`
- `mission-capability-policy/v1`
- `mission-desktop-execution/v1`
- `mission-execution-receipt/v1` and `mission-execution-receipt/v2`
- `mission-outcome/v1`
- `mission-authority-interruption/v1`
- `mission-receipt-signature/v1`
- `mission-public-key-manifest/v1`
- `mission-horizon-prompt/v1`

Schema identifiers are additive. Existing identifiers are never silently reassigned.

## Current action classes

Mission Gate 0.2 implements a deliberately small registry:

| Action class | Risk class | External effect |
| --- | --- | --- |
| `browser.research.read` | read-only | none |
| `agent.plan.prepare` | plan-only | none |
| `gmail.draft.create` | reversible write | draft only |
| `mission.task.update.local` | local state move | local only |
| `email.send.external` | external consequence | email send |

The wider v0.1 protocol registry remains valid for other implementations. A host must reject unknown action classes unless it explicitly publishes an extension or mapping.

## Signed receipt rules

A v2 execution receipt is emitted only for a completed execution. It binds the exact input, action, grant, decision, policy, payload, provider result, trace context, workspace, and signing key. The signature algorithm and version are fixed at `ed25519` and `v1` for this profile.

Preparation, a queued request, a paused run, and approval are not execution. Hosts should record them as their own state transitions and emit the completion receipt only after the provider reports the effect.

## Conformance

Run the zero-dependency CLI against one object or a cross-object chain:

```sh
npx @gomission/mission-schemas mission-schemas-conform \
  --schema mission-execution-receipt/v2 \
  --file receipt.json

npx @gomission/mission-schemas mission-schemas-conform \
  --chain \
  --file chain.json
```

The package includes positive and adversarial fixtures. Unknown fields, unsupported versions, malformed digests, missing commitments, and signature-domain drift fail conformance.
