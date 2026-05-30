# Trust Graduation

Embeddable permission, evidence, and approval protocol for human-gated agent autonomy.

Most agent systems ask: what can this agent automate?

Trust Graduation asks: what has this agent earned the right to do for this user, in this action class, under these constraints?

## Install

```bash
npm install @phenomenalabs/trust-graduation
```

## Six-line Embed

```js
import { TrustGraduation } from "@phenomenalabs/trust-graduation";

const tg = new TrustGraduation({ workspace: "user-123", evidence: localLedger });
const decision = tg.canExecute({ actionClass: "email.send.external", context: { recipient, body } });

if (decision.allowed) await actuallySend();
else if (decision.needsApproval) await pushApprovalToUser(decision.packet);
```

External sends, public posts, money movement, legal commitments, and policy changes stay approval-gated by default.

## What This Repo Contains

- `src/` — zero-dependency JavaScript reference implementation.
- `schemas/v1/` — JSON schemas for action classes, evidence, decisions, and approval packets.
- `docs/spec-overview.md` — one-page spec overview.
- `docs/spec-deep-dive.md` — compact v1 protocol details.
- `examples/minimal.js` — minimal embed example.
- `packages/python/` and `packages/go/` — package placeholders for the next language ports.

## Core Concepts

- Action class: the specific kind of thing an agent wants to do, such as `draft.response` or `email.send.external`.
- Evidence ledger: approvals, edits, rejections, receipts, outcomes, trust issues, and rollbacks.
- Autonomy level: the current earned capability for an action class.
- Approval packet: a standard payload any agent product can render when a human decision is required.

## Status

`0.1.0-alpha.0`. The API is intentionally small and will change only when the v1 schemas require it.

## License

Apache-2.0.

