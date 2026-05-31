# Trust Graduation

Every agent product is rebuilding the permission layer. Trust Graduation is the embeddable standard for human-gated agent autonomy: earned per action class, on real evidence, with a universal approval payload. Embed in six lines. Apache-licensed. Zero dependencies. Reference implementation: Mission by Phenomena Labs Ltd.

Most agent systems ask: what can this agent automate?

Trust Graduation asks: what has this agent earned the right to do for this user, in this action class, under these constraints?

## Install

```bash
npm install @trust-graduation/core
```

## Six-line Embed

```js
import { TrustGraduation } from "@trust-graduation/core";

const tg = new TrustGraduation({ workspace: "user-123", evidence: localLedger });
const decision = tg.canExecute({ actionClass: "email.send.external", context: { recipient, body } });

if (decision.allowed) await actuallySend();
else if (decision.needsApproval) await pushApprovalToUser(decision.packet);
```

External sends, public posts, money movement, legal commitments, and policy changes stay approval-gated by default.

## Embedded By

Early adopters will be listed here.

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
- License token: a free-stage entitlement token for protocol features such as `core`, `schemas`, `approval-packets`, and future federation.

## Status

Package status: `0.1.0-alpha.0`.

Schema status: draft `schemas/v1/`.

The schemas describe the protocol shape. The package is the reference implementation. Schemas reach stable `v1.0` after three external implementations or integrations, one public adopter, and no breaking schema changes for 30 days. Package `1.0.0` follows when the JavaScript API matches stable schemas and has CI-covered compatibility tests.

## License

Apache-2.0.
