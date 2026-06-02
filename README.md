# Trust Graduation

Every agent product is rebuilding the permission layer. Trust Graduation is the embeddable standard for human-gated agent autonomy: earned per action class, on real evidence, with a universal approval payload. Embed in six lines. Apache-licensed. Zero dependencies. Reference implementation: Mission by Phenomena Labs Ltd.

Most agent systems ask: what can this agent automate?

Trust Graduation asks: what has this agent earned the right to do for this user, in this action class, under these constraints?

The long-form thinking is in [MANIFESTO.md](MANIFESTO.md).

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

## Coming Next

Trust Graduation is intended as a small protocol family, not a single SDK. The next primitives stay gated on adoption: do not ship a new package until the prior primitive has at least one external embed or partner review.

- `@trust-graduation/receipts` — universal evidence that an agent-mediated action happened. Preview: `schemas/v2/receipts.schema.json`.
- `@trust-graduation/open-loops` — shared pending-work shape so agents can claim, close, dedupe, and hand off work.
- `@trust-graduation/voice` — portable user voice profile and draft-conformance payloads.
- `@trust-graduation/federation` — optional consented hosted layer for cross-product evidence, receipts, loops, and voice.

This week: autonomy. Next: receipts. Then: open loops. Then: voice. All under one open standard.

## What This Repo Contains

- `src/` — zero-dependency JavaScript reference implementation.
- `schemas/v1/` — JSON schemas for action classes, evidence, decisions, approval packets, and license entitlements.
- `schemas/v2/receipts.schema.json` — forward-design preview for the receipts primitive; not a shipped package yet.
- `docs/spec-overview.md` — one-page spec overview.
- `docs/spec-deep-dive.md` — compact v1 protocol details.
- `docs/receipts-forward-design.md` — rationale and storage-agnostic API sketch for future receipts work.
- `docs/github-npm-publishing.md` — what belongs in GitHub and npm, plus release checklist.
- `docs/pdf/trust-graduation-protocol.pdf` — printable protocol packet generated with `npm run docs:pdf`.
- `examples/minimal.js` — minimal embed example.
- `packages/python/` and `packages/go/` — package placeholders for the next language ports.

## Documentation

Generate the printable protocol packet:

```bash
npm run docs:pdf
```

The PDF is written to `docs/pdf/trust-graduation-protocol.pdf`. It is included in the npm package because `package.json` includes `docs/` in `files`.

## Core Concepts

- Action class: the specific kind of thing an agent wants to do, such as `draft.response` or `email.send.external`.
- Evidence ledger: approvals, edits, rejections, receipts, outcomes, trust issues, and rollbacks.
- Autonomy level: the current earned capability for an action class.
- Approval packet: a standard payload any agent product can render when a human decision is required.
- License entitlement: a free-stage token payload for protocol features such as `core`, `schemas`, `approval-packets`, `local-evidence`, and future federation.

## License Entitlements

The package defaults to a free local protocol license. Tokens are intentionally simple in alpha: `tg1.<base64url-json>`. They do not contact a server and they do not change the Trust Graduation decision contract.

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

Package status: `0.1.0-alpha.1`.

Schema status: draft `schemas/v1/`.

The schemas describe the protocol shape. The package is the reference implementation. Schemas reach stable `v1.0` after three external implementations or integrations, one public adopter, and no breaking schema changes for 30 days. Package `1.0.0` follows when the JavaScript API matches stable schemas and has CI-covered compatibility tests.

## License

Apache-2.0.
