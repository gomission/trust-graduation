# Receipts: Shipped Local Contract and Federation Direction

Trust Graduation core decides what an agent has earned the right to do. Receipts are the evidence that something actually happened.

Mission now emits and verifies signed, trace-correlated local receipts using `mission-execution-receipt/v2`. The schema, canonicalization code, conformance CLI, and fixtures ship in `packages/mission-schemas` as `@gomission/mission-schemas`.

The separate `@trust-graduation/receipts` storage/federation package described below remains forward design. It should only ship after an external embed demonstrates a real interoperability need.

## Implemented Receipt v2

The shipped receipt contract commits to:

- the exact normalized input through `input_hash`;
- action, grant, decision, policy, and payload digests;
- the provider result and one immediate signal;
- enqueue and processing spans under one trace identifier;
- an Ed25519 signature from a workspace-scoped key; and
- strict schemas with unknown fields rejected.

`receiptSigningBytes()` signs canonical JSON with the signature envelope removed. `validateReceiptChain()` checks cross-object digests, workspace integrity, and signature-domain consistency. Cryptographic verification and storage remain host responsibilities.

## Why Receipts Exist

Every agent product needs an audit trail. Without a shared receipt shape, each agent keeps private logs that other agents cannot use. A Trust Graduation receipt makes completed work legible across products:

- Core can treat receipts as evidence for autonomy graduation.
- Other agents can avoid duplicating work that has already closed.
- Users get one audit trail for agent-mediated actions.
- Future federation can share evidence across products with explicit consent.

## Earlier Federation Sketch

```json
{
  "protocol": "trust-graduation-receipts",
  "version": "1.0",
  "receiptId": "rcpt_20260531_abc",
  "workspace": "user-ronen",
  "agent": "cursor",
  "actionClass": "code.commit",
  "result": "completed",
  "evidence": {
    "target": "commit:abc123",
    "summary": "Added auth middleware",
    "approvedBy": "human:ronen",
    "approvedAt": "2026-05-31T10:00:00Z",
    "completedAt": "2026-05-31T10:00:30Z",
    "humanEditDistance": 0.05,
    "outcome": "merged"
  },
  "links": {
    "approvalPacketId": "tg_xyz",
    "openLoopId": "ol_abc",
    "ruleEvidence": ["rule:proof-backed-followups"]
  }
}
```

## Future Storage Package Sketch

```js
import { ReceiptStore } from "@trust-graduation/receipts";

const store = new ReceiptStore({ workspace: "user-ronen" });

const receipt = store.append({
  agent: "my-agent",
  actionClass: "email.send.external",
  result: "completed",
  evidence: {
    target: "msg:xyz",
    summary: "Sent approved follow-up"
  }
});

const recent = store.query({
  actionClass: "email.send.external",
  since: "2026-05-24T00:00:00Z",
  federated: true
});
```

The package should stay storage-agnostic: local file, product database, and `trust-graduation.org/api` federation can all satisfy the same interface.

## Discipline Gate

Do not ship `@trust-graduation/receipts` until:

- `@trust-graduation/core` has one external embed.
- Mission emits receipts internally in a way that maps cleanly to the schema.
- One external partner wants receipt emission or consumption enough to review the schema.

Until then, the public interoperability artifacts are the receipt v2 schema and conformance code in `packages/mission-schemas`; `schemas/v2/receipts.schema.json` remains the earlier federation sketch and is not the current execution-receipt shape.
