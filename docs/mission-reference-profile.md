# Mission Reference Implementation Profile

Mission is the canonical commercial implementation of Trust Graduation. This profile describes how the current Mission runtime applies protocol v0.1 without making Mission-specific storage, dashboards, or orchestration features mandatory for other adopters.

## Conformance Boundary

Portable protocol objects remain:

- `ActionClassPolicy`
- `EvidenceEvent`
- `Decision`
- `ApprovalPacket`
- `ExecutionReceipt`

Mission adds product-level objects around that boundary. Steward moves, goals, workflows, model tiers, skill candidates, and proof reports are not new protocol requirements. They create requests, evidence, or human-readable summaries that flow through the five portable objects.

## Current Mission Mapping

| Mission capability | Protocol role | Evidence discipline |
| --- | --- | --- |
| Steward move | Proposed action plus action class | Preparation is not execution and earns no outcome credit by itself. |
| Review queue or approval packet | `ApprovalPacket` | Approval is bounded to the proposed action, principal, constraints, and expiry. |
| Receipt | `ExecutionReceipt` | `mission-execution-receipt/v2` records one completed execution with exact-input and cross-object digests, trace context, provider result, immediate signal, and an Ed25519 workspace signature. Waiting, blocked, and prepared are not completion receipts. |
| Attributed outcome | `EvidenceEvent` linked to a move or receipt | Strong deterministic matches may resolve automatically; fuzzy matches require human selection; unresolved outcomes remain explicit orphans. |
| Steward calibration | Evidence aggregation by action class, track, or score bucket | Buckets below the configured minimum sample count are marked insufficient evidence and are not ranked. |
| Mission proof report | Human-readable provenance summary | Reports attributed outcomes divided by Mission-prepared moves and does not claim credit for untracked manual work. |
| Skill or workflow install | Local proposed mutation | Installation requires a review packet; applying an approved workflow changes local state but does not execute its external actions. |
| Model tier routing | Implementation routing metadata | Model, tier, tokens, cost, fallback count, action class, receipt id, and steward move id may be logged as supporting evidence. Model choice never grants authority. |
| Trust regression | Policy response to negative evidence | Rejections, corrections, failures, trust issues, and rollbacks can reduce autonomy for the affected action class. |

## Required Safety Properties

A Mission-compatible implementation should preserve these properties:

1. Authority is evaluated per action class, not granted globally to an agent or model.
2. Prepared work is never reported as externally completed work.
3. External effects require a protocol decision before execution.
4. Approval packets are narrow, inspectable, and attributable to a principal.
5. Receipts and outcomes retain provenance; missing attribution is represented honestly.
6. Aggregates expose sample counts and suppress recommendations when evidence is insufficient.
7. Workflow discovery, skill promotion, and model routing cannot bypass the same action-class gate as hand-authored work.

## Current Reference Flow

```text
goal or signal
  -> steward move / workflow proposal
  -> action-class decision
  -> safe local preparation or approval packet
  -> principal review for consequential effects
  -> execution receipt
  -> attributed outcome
  -> calibration and proof
  -> bounded graduation or regression
```

Mission stores this evidence locally in inspectable files and exposes selected read-first views through CLI, web, MCP, ChatGPT, Claude, and native app surfaces. Mission Gate's current machine-readable vocabulary is published in `packages/mission-schemas`, including decision v2, signed receipt v2, attributed outcomes, authority interruptions, and public-key manifests. Other implementations may use databases or remote services as long as they preserve the protocol objects, provenance, and approval semantics.

## Non-Claims

- A model tier is a quality or cost routing choice, not an autonomy tier.
- A generated skill candidate is not a trusted skill until reviewed and promoted.
- A scheduled loop is not authorized to perform every action it can propose.
- A dashboard count is not proof unless it can be traced to the underlying evidence.
- Mission's current OpenAI app review, native app packaging, and external integrations are distribution surfaces, not protocol conformance signals.
