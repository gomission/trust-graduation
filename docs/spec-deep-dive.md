# Trust Graduation Protocol v0.1 Deep Dive

This document describes the camelCase JavaScript reference implementation.
The canonical portable v0.1 method at `trustgraduation.org/spec/0.1/` uses a
smaller snake_case vocabulary, and the two representations are not claimed to
be byte-identical. Exact cross-runtime action authority is specified separately
by the versioned A2A extension schemas.

Status: alpha draft
Purpose: define the protocol surface independent of any one product

## 1. Scope

Trust Graduation is a protocol for bounded agent authority.

It answers a narrower question than general authorization systems:

> Has this agent earned the right to perform this class of action for this principal under the current constraints?

The protocol is intentionally decision-centric. It does not require a specific storage engine, identity provider, user interface, transport, or machine learning model.

## 2. Actors

A conforming implementation should model these roles explicitly even if one product collapses them internally:

- `principal`: the person or organization whose trust boundary is being protected
- `agent`: the software actor proposing or taking action
- `host`: the product or runtime evaluating Trust Graduation rules
- `approver`: the human or delegated authority who can approve a bounded action
- `executor`: the component that performs the side effect once allowed
- `auditor`: a human or system reviewing receipts, violations, and regressions

## 3. Action Classes

An action class is the smallest portable unit of earned autonomy.

Examples:

- `read.context`
- `draft.compose`
- `draft.response`
- `tool.call.local`
- `email.send.internal`
- `email.send.external`
- `calendar.create`
- `social.post.public`
- `payment.initiate`
- `proposal.submit`

Action classes should be:

- stable enough to accumulate evidence over time
- narrow enough that evidence on one class does not over-grant another
- legible to users, auditors, and integrators

An implementation may normalize product-specific actions into a shared action-class vocabulary.

## 4. Protocol Objects

### 4.1 `ActionClassPolicy`

Defines the default trust boundary for one action class.

Recommended fields:

- `actionClass`
- `description`
- `riskClass`
- `minimumLevel`
- `requiresApproval`
- `receiptRequired`
- `externalSideEffects`
- `reversible`
- `defaultConstraints`
- `regressionTriggers`

### 4.2 `EvidenceEvent`

Represents one trust-relevant event for one action class.

Required semantic fields:

- `actionClass`
- `type`

Recommended fields:

- `eventId`
- `principal`
- `agent`
- `source`
- `sourceType`
- `decisionWeight`
- `provenanceWeight`
- `evidenceWeight`
- `recordedAt`
- `decisionId`
- `approvalPacketId`
- `receiptId`
- `outcomeId`
- `editDistance`
- `severity`
- `metadata`

Canonical event types should include at least:

- `approved`
- `edited`
- `rejected`
- `held`
- `executed`
- `receipt_logged`
- `outcome_positive`
- `outcome_negative`
- `trust_issue`
- `rollback`
- `policy_exception`

Evidence must come from real interaction, execution, outcome, or repair. More drafts, raw model confidence, or synthetic success claims are not evidence.

Implementations should compose decision quality and provenance where source reliability is available:

```text
evidenceWeight = decisionWeight * provenanceWeight
```

Default provenance weights are `receipt=1.0`, `principal=1.0`, `connector=0.3`, and `model_inferred=0.1`.

### 4.3 `Decision`

Represents the output of evaluating one requested action.

A `Decision` should answer:

- is the action allowed now?
- is approval required?
- what mode applies?
- what trust state was used?
- what policy justified it?
- what evidence summary justified it?
- what approval packet or next step is required?

Recommended fields:

- `decisionId`
- `requestedAction`
- `actionClass`
- `allowed`
- `needsApproval`
- `status`
- `mode`
- `autonomyLevel`
- `tier`
- `policy`
- `evidence`
- `constraints`
- `reason`
- `packet`
- `createdAt`

### 4.4 `ApprovalPacket`

A portable payload for bounded human review.

A conforming packet should make the human able to answer:

- what exactly is being asked?
- why is it gated?
- what risk class applies?
- what evidence exists?
- what can I approve once versus reject or revise?
- what receipt will exist if this runs?

Recommended fields:

- `packetId`
- `decisionId`
- `workspace` or `scope`
- `requestedBy`
- `principal`
- `actionClass`
- `riskClass`
- `externalSideEffects`
- `approvalRequired`
- `receiptRequired`
- `reason`
- `requestedAction`
- `constraints`
- `evidence`
- `decisions`
- `createdAt`
- `expiresAt`

### 4.5 `ExecutionReceipt`

The full receipts primitive is still separate, but implementations should already assume the need for a portable execution record.

Minimum expectations:

- a stable `receiptId`
- linkage to the decision or approval packet
- summary of what executed
- time of execution
- executor identity when available
- target summary
- rollback pointer or reason if repaired later

## 5. Evidence Tiers And Autonomy

This reference implementation uses four evidence tiers:

| Tier | Meaning |
|---|---|
| `gated` | Default state or insufficient evidence |
| `supervised` | Positive evidence exists, but review boundaries still matter |
| `auto_capped` | Repeated clean evidence for narrow bounded automation |
| `review` | Negative evidence or trust regression requires explicit review |

These tiers are implementation guidance, not the entire protocol. A host may use different internals as long as it returns a conforming `Decision` and preserves the core trust boundary.

## 6. Decision Status And Modes

A conforming implementation should use explicit decision status values rather than a single boolean.

Recommended status values:

- `allowed`
- `allowed_with_constraints`
- `review_required`
- `deferred`
- `blocked`
- `human_only`

The JavaScript reference implementation also keeps the older `mode` field for compatibility and explanation. `mode` may contain values such as `supervised`, `auto_capped`, `approval_required`, `review_only`, `insufficient_evidence`, `pending_atomic_consumption`, or `human_only`. A matching consequential-action grant stays in `pending_atomic_consumption` with `allowed: false` until the executor wins a shared atomic consume operation.

This makes the protocol legible to products, logs, and auditors.

## 7. Constraints

Trust Graduation is only meaningful if approvals and grants are bounded.

Constraints may include:

- `internal_only`
- `staging_only`
- `dry_run_only`
- `max_amount`
- `rate_limit`
- `recipient_allowlist`
- `domain_allowlist`
- `expires_at`
- `requires_witness`
- `redaction_rules`

A request should never be treated as globally approved just because a similar action was approved before.

## 8. Regression

Trust must be able to move down.

Regression should occur when an action class accumulates events such as:

- trust issues
- repeated rejections
- high edit distance after prior confidence
- rollback events
- unsupported claims
- wrong recipient or target selection
- policy exceptions
- negative downstream outcomes

A protocol implementation should expose regression visibly through the returned `Decision` or associated audit state.

## 9. Conformance Requirements For v0.1

A v0.1 conforming implementation should:

- evaluate trust per action class, not globally
- expose a decision artifact, not only UI behavior
- preserve an evidence model with real event types
- support bounded approval packets for gated actions
- keep high-risk external side effects approval-gated by default
- support regression after negative evidence
- make execution auditable with a stable identifier or receipt hook

A v0.1 conforming implementation does not need to:

- use cryptographic signatures
- use decentralized identity
- use a hosted service
- share evidence across products
- use Mission’s exact heuristics or thresholds

## 10. Extensions

The following fit naturally as protocol extensions rather than core requirements:

- signed receipts
- verifiable identity for principal, agent, and approver
- delegated actor chains
- cross-product evidence portability
- consented federation
- domain-specific action-class registries

These should layer on top of the core decision contract, not replace it.
