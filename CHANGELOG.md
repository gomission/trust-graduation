# Changelog

## 0.2.0-beta.1 — 2026-08-04

- Promoted the JavaScript core from alpha to beta without changing the v0.1 portable decision contract.
- Added `packages/mission-schemas` as the canonical public source for Mission Gate's current protocol vocabulary and conformance CLI.
- Documented shipped receipt v2 behavior: deterministic canonicalization, exact-input and cross-object digests, Ed25519 workspace signatures, trace correlation, outcome attribution, and authority interruptions.
- Added positive and adversarial fixtures for the current schemas and cross-object conformance rules.
- Reframed receipt federation as future design while accurately marking local signed receipts as implemented.

## 0.1.0-alpha.8

- Added the Mission reference implementation profile for steward moves, approval-gated workflow installation, receipts, attributed outcomes, proof reports, and model-routing telemetry.
- Clarified which Mission features are protocol objects, implementation evidence, and product-level orchestration so adopters can remain interoperable without copying Mission's storage model.
- Refreshed the protocol packet and package preview against the current reference implementation.

## 0.1.0-alpha.7

- Added machine-readable graduation paths to gated decisions: evidence still needed, the next safe action, and a lower-consequence fallback action class.
- Extended the decision schema and reference implementation tests for agent-native recovery from review, defer, block, and human-only decisions.

## 0.1.0-alpha.6

- Set `https://trustgraduation.org/` as the canonical protocol homepage for GitHub and npm package metadata.
- Added public crawler resources to the README: v0.1 spec, `llms.txt`, `humans.txt`, and `/.well-known/trust-graduation`.
- Corrected package repository and issue URLs to the active GitHub repo.

## 0.1.0-alpha.5

- Aligned public v1 schema `$id` hosts with the canonical Mission protocol URL: `https://gomission.io/spec/trust-graduation/0.1/`.
- Kept non-core extension schemas on their existing package/docs hosts.

## 0.1.0-alpha.4

- Reconciled the v0.1 canonical action-class registry with Mission: `read.context`, `draft.compose`, `draft.response`, `tool.call.local`, `email.send.internal`, `email.send.external`, `calendar.create`, `social.post.public`, `payment.initiate`, and `proposal.submit`.
- Added legacy aliases for older class names such as `payment.spend`, `calendar.create.external`, `social.post.external`, and Mission's early underscore drafting classes.
- Added protocol-facing decision `status` values: `allowed`, `allowed_with_constraints`, `review_required`, `deferred`, `blocked`, and `human_only`, while preserving existing `allowed`, `needsApproval`, and `mode` fields.
- Added provenance-aware evidence weighting helpers and summary fields: `decisionWeight`, `provenanceWeight`, `evidenceWeight`, `weightedPositive`, and `weightedNegative`.
- Expanded v1 schemas for decision constraints, provenance-weighted evidence, canonical action classes, and v1 receipt commitments.

## 0.1.0-alpha.3

- Correct npm metadata to point at the current public GitHub repository.
- Regenerate the printable protocol PDF.

## 0.1.0-alpha.2

- Regenerated the printable protocol PDF and npm package preview after the full Mission documentation refresh.
- Re-uploaded the alpha package so the public package metadata and protocol packet stay current.

## 0.1.0-alpha.1

- Added TG-SKILL.md schema, format documentation, and first portable example skill.
- Added Hermes-class embedding note for agent runtimes that need a Trust Graduation safety layer.
- Added receipts forward-design docs, printable protocol PDF generation, and npm/GitHub publishing guide.
- Published updated protocol docs and schemas as the alpha.1 npm package.

## 0.1.0-alpha.0

- Initial JavaScript reference implementation.
- Added JSON schemas for action classes, evidence events, decisions, and approval packets.
- Added spec overview, deep dive, adoption roadmap, and minimal embed example.
- Added thin Python and Go alpha ports.
- Added TypeScript declarations.
- Added free-stage license entitlement helpers and schema for future protocol monetization without changing the autonomy decision contract.
