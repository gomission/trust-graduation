# Trust Graduation Protocol v0.1 Overview

Status: alpha draft
Purpose: define a portable protocol for bounded agent authority

Trust Graduation is an open protocol for deciding what an agent has earned the right to do for a principal, in a specific action class, under explicit constraints, with evidence, approval semantics, and auditability.

The protocol does not grant global trust. It evaluates one requested action at a time against policy, evidence, approvals, and rollback expectations.

## Core Sentence

An agent may execute only what it has earned for this principal, in this action class, under these constraints.

## Design Goals

- Bound authority to one action class at a time.
- Separate policy, evidence, decision, approval, execution, and receipt.
- Keep high-risk external actions approval-gated by default.
- Make trust regressible when evidence deteriorates.
- Stay portable across local runtimes, HTTP APIs, MCP surfaces, and multi-agent systems.
- Let products adopt the protocol without adopting Mission.

## Core Objects

Trust Graduation v0.1 defines five primary protocol objects:

1. `ActionClassPolicy`
2. `EvidenceEvent`
3. `Decision`
4. `ApprovalPacket`
5. `ExecutionReceipt`

The reference implementation also defines a license entitlement payload. Entitlements govern package or service features. They do not grant autonomy and they do not change decision outcomes.

Evidence may compose outcome quality with source reliability. The default provenance weights are `receipt=1.0`, `principal=1.0`, `connector=0.3`, and `model_inferred=0.1`.

## Core Lifecycle

1. An agent proposes a requested action in an action class.
2. The host evaluates the request against policy and evidence.
3. The host returns a `Decision`.
4. If review is needed, the host issues an `ApprovalPacket`.
5. If a human approves, the bounded action may execute.
6. Execution produces an audit trail and, where applicable, a receipt.
7. Outcomes, corrections, violations, and rollbacks become future `EvidenceEvent` rows.

## Autonomy Ladder

| Level | Name | Meaning |
|---:|---|---|
| 0 | Observe | Read, summarize, classify, flag, and explain. |
| 1 | Prepare | Draft, rank, route, and assemble review material. |
| 2 | Stage | Pre-fill bounded local actions or ready fields for final review. |
| 3 | Execute Narrow | Execute low-risk, reversible actions in a bounded lane with receipts. |
| 4 | Delegate | Run a bounded workflow inside a defined domain with review hooks. |
| 5 | Govern | Recommend policy or autonomy changes, never self-approve them. |

Autonomy is not a blanket product setting. Each action class has its own current level, evidence history, and regression state.

## Default Boundary

The following remain approval-gated by default:

- external sends
- public posting
- money movement
- legal commitments
- irreversible submissions
- permission changes
- policy changes
- authority expansion

A product may define narrower policies, but it should not silently weaken these defaults.

## Required Trust Properties

A conforming implementation should make the following visible for each requested action:

- who is acting
- for whom they are acting
- what action class is requested
- what constraints apply
- what evidence was considered
- what decision status applies
- whether approval is required
- whether the action executed
- what receipt or audit record exists
- how the trust state can regress

## Public Promise

Never sends without approval.
