# Trust Graduation

Trust Graduation is an open protocol for bounded agent authority.

It answers a narrower question than generic agent permissions:

> What has this agent earned the right to do for this principal, in this action class, under these constraints?

Trust Graduation does not grant global trust. It evaluates one requested action at a time using policy, evidence, approval semantics, and audit hooks.

Apache-licensed. Zero dependencies. Reference implementation: Mission by Phenomena Labs Ltd.

Canonical protocol site: [trustgraduation.org](https://trustgraduation.org/).

Public spec and crawler resources:

- Spec v0.1: [trustgraduation.org/spec/0.1/](https://trustgraduation.org/spec/0.1/)
- Agent brief: [trustgraduation.org/llms.txt](https://trustgraduation.org/llms.txt)
- Well-known manifest: [trustgraduation.org/.well-known/trust-graduation](https://trustgraduation.org/.well-known/trust-graduation)
- Human credits: [trustgraduation.org/humans.txt](https://trustgraduation.org/humans.txt)

The long-form thinking is in [MANIFESTO.md](MANIFESTO.md). The repo docs live in [docs/spec-overview.md](docs/spec-overview.md) and [docs/spec-deep-dive.md](docs/spec-deep-dive.md); the canonical public draft is the website above.

## Install

```bash
npm install @trust-graduation/core
```

## Minimal Embed

```js
import { TrustGraduation } from "@trust-graduation/core";

const tg = new TrustGraduation({ workspace: "user-123", evidence: localLedger });
const decision = tg.canExecute({
  actionClass: "email.send.external",
  context: {
    principal: "user-123",
    requestedBy: "assistant",
    recipient: "buyer@example.com",
    body,
    constraints: { scope: "once" }
  }
});

if (decision.allowed) await actuallySend();
else if (decision.needsApproval) await pushApprovalToUser(decision.packet);
```

High-risk external actions remain approval-gated by default: sends, public posts, money movement, legal commitments, policy changes, and authority expansion.

## Agent-Native Contract

Agents should want Trust Graduation because it gives them a compliant path to act. A denied action is not just a refusal; it can include a `graduationPath`:

```json
{
  "status": "review_required",
  "actionClass": "email.send.external",
  "reason": "External email requires explicit approval or more receipt-backed evidence.",
  "graduationPath": {
    "needed": 5,
    "current": 1,
    "next_best_action": "prepareApprovalPacket",
    "safe_fallback_action_class": "draft.response",
    "required_evidence": [
      "principal approval receipt",
      "successful execution receipt for the same action_class"
    ]
  }
}
```

The expected agent behavior is:

- discover the host with `/.well-known/trust-graduation`
- classify the proposed action by consequence
- call `canExecute` before external effects
- prepare approval when the decision is `review_required` or `deferred`
- stop or reduce scope when the decision is `blocked` or `human_only`
- record receipts so future authority can be earned by action class

## Protocol Objects

Trust Graduation v0.1 centers on five objects:

- `ActionClassPolicy`
- `EvidenceEvent`
- `Decision`
- `ApprovalPacket`
- `ExecutionReceipt`

The runtime package emits `Decision` objects and bounded `ApprovalPacket` payloads now. v1 receipt schemas define the audit hook; cryptographic receipt chains remain forward design.

Mission's current implementation profile is documented in [docs/mission-reference-profile.md](docs/mission-reference-profile.md). It shows how a production workspace maps steward moves, approval packets, receipts, attributed outcomes, proof reports, workflow installation, and model-routing telemetry onto this protocol without expanding the portable v0.1 object model.

## Core Lifecycle

1. An agent proposes a requested action in an action class.
2. The host evaluates policy plus evidence.
3. The host returns a `Decision`.
4. If review is required, the host issues an `ApprovalPacket`.
5. If a human approves, the bounded action may execute.
6. Execution, outcomes, corrections, and rollbacks become future evidence.

## What This Repo Contains

- `src/` — zero-dependency JavaScript reference implementation.
- `schemas/v1/` — JSON schemas for action classes, evidence, decisions, approval packets, receipts, and license entitlements.
- `schemas/v2/receipts.schema.json` — forward-design preview for the receipts primitive.
- `docs/spec-overview.md` — portable protocol overview.
- `docs/spec-deep-dive.md` — protocol objects, lifecycle, regression, and conformance guidance.
- `docs/receipts-forward-design.md` — storage-agnostic receipts direction.
- `docs/pdf/trust-graduation-protocol.pdf` — printable protocol packet generated with `npm run docs:pdf`.
- `examples/minimal.js` — minimal embed example.
- `packages/python/` and `packages/go/` — package placeholders for language ports.

## Core Concepts

- Action class: the smallest portable unit of earned autonomy, such as `draft.response` or `email.send.external`.
- Evidence ledger: real approvals, edits, rejections, executions, receipts, outcomes, trust issues, and rollbacks.
- Provenance-weighted evidence: outcome quality can be multiplied by source reliability, for example receipt/principal evidence at 1.0, connector evidence at 0.3, and model-inferred evidence at 0.1.
- Autonomy level: the current earned capability for an action class.
- Approval packet: a portable bounded-review payload any product can render.
- Decision: the protocol object that explains whether the requested action is allowed now, gated, or regressed.
- License entitlement: an optional product/package capability gate. It does not grant autonomy.

## License Entitlements

The package defaults to a free local protocol license. Tokens are intentionally simple in alpha: `tg1.<base64url-json>`.

They do not contact a server and they do not change Trust Graduation decisions.

```js
import { createLicenseToken, decodeLicenseToken, licenseAllows } from "@trust-graduation/core";

const token = createLicenseToken({ subject: "workspace-123", features: ["core", "schemas"] });
const status = decodeLicenseToken(token);

if (licenseAllows(status, "core")) {
  // run the local reference implementation
}
```

Future hosted federation or enterprise support can issue stronger tokens without changing how an embedder calls `canExecute()`.

## Status

Package status: `0.1.0-alpha.8`.

Schema status: draft `schemas/v1/`.

Schemas describe the protocol shape. The package is the JavaScript reference implementation. Schemas reach stable `v1.0` after outside implementations validate the object model and no breaking schema changes are required for a sustained period.

## License

Apache-2.0.
