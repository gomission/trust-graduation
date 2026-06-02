# Receipts Forward Design

Trust Graduation core decides what an agent has earned the right to do. Receipts are the evidence that something actually happened.

This document is forward design, not a shipped package. `@trust-graduation/receipts` should only ship after `@trust-graduation/core` has at least one external embed.

## Why Receipts Exist

Every agent product needs an audit trail. Without a shared receipt shape, each agent keeps private logs that other agents cannot use. A Trust Graduation receipt makes completed work legible across products:

- Core can treat receipts as evidence for autonomy graduation.
- Other agents can avoid duplicating work that has already closed.
- Users get one audit trail for agent-mediated actions.
- Future federation can share evidence across products with explicit consent.

## Minimal Shape

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

## Package Sketch

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

Until then, the only artifact is the schema preview at `schemas/v2/receipts.schema.json`.
