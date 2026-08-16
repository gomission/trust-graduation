# Trust Graduation

Trust Graduation is an open method and experimental interoperability profile for bounded agent authority.

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

The long-form thinking is in [MANIFESTO.md](MANIFESTO.md). The repo docs live in [docs/spec-overview.md](docs/spec-overview.md) and [docs/spec-deep-dive.md](docs/spec-deep-dive.md); the canonical public draft is the website above. No independent implementation has completed conformance yet, so this repository deliberately describes the interoperability layer as experimental rather than as an established standard.

## Install

```bash
npm install @trust-graduation/core@beta
```

Or prove the exact Mission Key boundary without installing, configuring an API,
or calling a provider:

```bash
npx -y @trust-graduation/core@beta demo
```

The machine-readable `DEMO_RESULT` proves that the first atomic consume wins
while changed input, an unchanged-grant replay, and a plain `approved` flag all
fail closed. This is a process-local protocol proof, not evidence of a durable
production store, independent deployment, or market adoption.

## Fifteen-Minute Provider Integration

The beta now includes a provider-bound adapter contract rather than asking an
integrator to infer one from the protocol objects:

```bash
npm install @trust-graduation/core@beta
npx trust-graduation init-adapter
npx trust-graduation conformance ./mission-gate-adapter.mjs --json
```

`init-adapter` creates one non-overwriting adapter file. Map its input to one
existing provider function, then run `conformance`. The runner injects the
provider and verifies that missing approval, mutation, issuer rejection, store
failure, replay, and a racing duplicate cannot bypass the boundary. It also
requires result-linked receipts for successful calls.

The adapter composes through `createProviderGate({ store,
authenticateGrant, provider, writeReceipt })`. All four trust-boundary
dependencies are mandatory. The detailed stopwatch path and production limits
are in [docs/15-minute-provider-integration.md](docs/15-minute-provider-integration.md).

The helper's receipt is result-linked but unsigned. Production hosts must add
their own receipt signature/journal and reconcile crashes or unknown provider
outcomes; atomic Key consumption is not exactly-once provider execution.

Passing the runner proves the adapter contract against an instrumented
provider. It is not independent adoption or a production security
certification; the real repository must compose the same factory around its
existing sandbox provider seam.

## Minimal Embed

```js
import {
  TrustGraduation,
  consumeApprovalGrant
} from "@trust-graduation/core";

const tg = new TrustGraduation({ workspace: "user-123", evidence: localLedger });
const request = {
  actionClass: "email.send.external",
  context: {
    principal: "user-123",
    requestedBy: "assistant",
    recipient: "buyer@example.com",
    body,
    constraints: { scope: "once" },
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
  }
};
const decision = tg.canExecute(request);

if (decision.needsApproval) {
  await pushExactBindingToUser(decision.packet.actionBinding);
}

// Later, after authenticating the issuer and receiving the exact grant:
const checked = tg.canExecute({ ...request, approval: authenticatedGrant });
if (checked.mode === "pending_atomic_consumption") {
  const authorization = await consumeApprovalGrant({
    binding: checked.actionBinding,
    approval: authenticatedGrant,
    store: sharedAtomicGrantStore
  });
  if (authorization.ok) await executeOnceAndWriteReceipt();
}
```

High-risk external actions remain approval-gated by default: sends, public posts, money movement, legal commitments, policy changes, and authority expansion. A plain `{ state: "approved" }` flag is rejected; execution requires a non-expired, non-revoked, single-use grant bound to the exact action hash.

`canExecute()` is a pure policy and structural-validation check: it does not
mutate durable state. Even a matching grant returns
`pending_atomic_consumption` with `allowed: false`. The provider boundary is
`consumeApprovalGrant()`, backed by a shared store whose `consume()` operation
atomically checks revocation and inserts the issuer + tenant + grant identity
exactly once. The
bundled `createMemoryGrantStore()` is safe only inside one process for demos and
tests. Storage failure, a racing duplicate, or a replay fails closed.

## A2A Exact Action Authorization

The first standards-facing profile targets the authorization gap intentionally left open by A2A v1. An agent can map a Trust Graduation review decision to `TASK_STATE_AUTH_REQUIRED`, carry an immutable action binding in extension metadata, receive an exact single-use grant, and return receipt evidence as a Task Artifact.

- Specification: [docs/a2a-action-authorization-extension-v1.md](docs/a2a-action-authorization-extension-v1.md)
- Extension URI: `https://trustgraduation.org/extensions/a2a/action-authorization/v1`
- Runnable example: `npm run example:a2a`

The extension is not identity or OAuth. Implementers must authenticate the grant issuer or verify a signature, then call `consumeApprovalGrant()` against a shared atomic store before invoking the provider. Validation alone never authorizes execution.

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

The runtime package emits JavaScript `Decision` objects and bounded `ApprovalPacket` payloads. The repository also ships the current Mission Gate conformance package, `@gomission/mission-schemas`: receipt v2 uses deterministic canonical JSON, exact-input SHA-256 commitments, Ed25519 workspace signatures, and trace correlation. Receipt federation remains future work; signed local receipts are implemented and tested.

### Schema layers

There are three deliberately distinct contracts; do not treat their files as
aliases:

- the canonical portable v0.1 method at `trustgraduation.org/spec/0.1/` uses a
  small, permissive snake_case vocabulary so non-JavaScript hosts can adopt the
  method without copying Mission internals;
- `schemas/v1/` preserves the stricter camelCase JavaScript reference-runtime
  contract under its existing `gomission.io` schema IDs for compatibility;
- `schemas/extensions/a2a/action-authorization/v1/` is the current exact-action
  interoperability wire contract, including binding, expiry, nonce, and
  single-use grant fields.

The beta does not claim that the older portable method schema and the
JavaScript runtime object are byte-identical. A future stable wire revision
must choose one versioned representation through independent implementation,
not a silent rename.

Mission's current implementation profile is documented in [docs/mission-reference-profile.md](docs/mission-reference-profile.md). It shows how a production workspace maps steward moves, approval packets, receipts, attributed outcomes, proof reports, workflow installation, and model-routing telemetry onto this protocol without expanding the portable v0.1 object model.

## Core Lifecycle

1. An agent proposes a requested action in an action class.
2. The host evaluates policy plus evidence.
3. The host returns a `Decision`.
4. If review is required, the host issues an `ApprovalPacket`.
5. If a human approves, authenticate the issuer and validate the exact grant.
6. Atomically consume the still-live grant in shared state; only that successful consume authorizes the provider call.
7. Execution, outcomes, corrections, and rollbacks become future evidence.

## What This Repo Contains

- `src/` — zero-dependency JavaScript reference implementation.
- `schemas/v1/` — compatibility schemas for the camelCase JavaScript reference runtime; not aliases of the canonical site schemas.
- `schemas/v2/receipts.schema.json` — earlier federation/storage sketch, retained for design history; it is not the current execution-receipt shape.
- `packages/mission-schemas/` — the current zero-dependency schema vocabulary, canonicalization helpers, signed receipt v2 contract, conformance CLI, and positive/adversarial fixtures used by Mission Gate.
- `docs/spec-overview.md` — portable protocol overview.
- `docs/spec-deep-dive.md` — protocol objects, lifecycle, regression, and conformance guidance.
- `docs/receipts-forward-design.md` — storage-agnostic receipts direction.
- `docs/pdf/trust-graduation-protocol.pdf` — printable protocol packet generated with `npm run docs:pdf`.
- `examples/minimal.js` — minimal embed example.
- `examples/provider-gate-adapter.mjs` — scaffolded provider adapter used by the fifteen-minute conformance path.
- `examples/mcp-provider-roundtrip.mjs` — optional two-package proof from an MCP hold through one exact provider call and result receipt.
- `examples/a2a-authority-continuation.js` — complete no-network A2A authorization continuation.
- `docs/15-minute-provider-integration.md` — timed provider-seam integration and evidence contract.
- `schemas/extensions/a2a/action-authorization/v1/` — exact action-binding and single-use grant schemas.
- `packages/python/` and `packages/go/` — package placeholders for language ports.

## Core Concepts

- Action class: the smallest portable unit of earned autonomy, such as `draft.response` or `email.send.external`.
- Evidence ledger: real approvals, edits, rejections, executions, receipts, outcomes, trust issues, and rollbacks.
- Provenance-weighted evidence: outcome quality can be multiplied by source reliability, for example receipt/principal evidence at 1.0, connector evidence at 0.3, and model-inferred evidence at 0.1.
- Autonomy level: the current earned capability for an action class.
- Approval packet: a portable bounded-review payload any product can render.
- Decision: the protocol object that explains whether the requested action is allowed now, gated, or regressed.
- License entitlement: an optional product/package capability gate. It does not grant autonomy.

## Legacy Entitlement Helpers

The package still exposes the alpha-era local entitlement helpers for compatibility. They are not part of the authority profile and should not be used as an adoption gate. Tokens are intentionally simple: `tg1.<base64url-json>`.

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

Core package status: `0.2.0-beta.2` (experimental beta).

Portable protocol schema status: experimental v0.1 at `trustgraduation.org/spec/0.1/`.

JavaScript reference-runtime schema status: compatibility draft `schemas/v1/`.

Mission Gate conformance status: `@gomission/mission-schemas` `0.1.0`, including `mission-decision/v2`, `mission-execution-receipt/v2`, `mission-outcome/v1`, signature envelopes, public-key manifests, and authority-interruption records.

Schemas describe the draft shape. The package is the JavaScript reference implementation. The profile reaches stable `v1.0` only after outside implementations validate the object model and no breaking schema changes are required for a sustained period.

## License

Apache-2.0.
