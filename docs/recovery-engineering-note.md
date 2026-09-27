# A recovered success can still lose to a late error

September 27, 2026 — Mission / Trust Graduation

A [browser-use discussion](https://github.com/browser-use/browser-use/discussions/5024#discussioncomment-18623032)
suggested a useful test: kill the connection between requesting approval and
resuming execution. We implemented it with persisted requests, separate human
decision turns, and receipts checked against provider-owned evidence.

Reviewing the result exposed a second race in our reference workflow:

1. Worker A claims execution. The provider commits the effect, but its response stalls.
2. Worker B queries the provider, verifies the effect and persists a confirmed receipt and completion.
3. Worker A's response fails. Its error path writes an unknown receipt and changes the request back to unknown.

The regression reproduced this with one provider call. An assertion expecting
`completed` got `outcome_unknown`. The fix needs two parts: apply an execution
failure only to the revision it started from, and prevent a late unknown
receipt from replacing an already confirmed receipt for the same action and
grant. Protecting only the request row would still leave a downgraded receipt
for the next reconciliation to read.

The regression is in `test/turn-boundary.test.js` as
`a late provider failure cannot undo a concurrently reconciled completion`.
It checks the request, the separate receipt, a subsequent resume, and the
provider call count. The file store uses atomic non-overwriting revisions;
another storage implementation must preserve the same concurrency rules.

We also ran four process-death scenarios across the official MCP TypeScript
SDK's stdio transport. The provider is a separate process with its own ledger.
After it commits, we kill the client before its tool reply arrives. A fresh
client recovers using a lookup and the call count stays one. Denial survives
restart; an unresolved effect stays unknown instead of triggering a resend.

Run the small walkthrough:

```bash
npx -y @trust-graduation/core@0.2.0-beta.5 turn-demo
```

Run the [MCP version](../examples/mcp-recovery/README.md), or map a workflow onto
the [adapter interruption checks](turn-workflow-conformance.md). Both retain
separate artifacts so a returned success flag is not the only evidence.

These are controlled local tests with a synthetic effect and test authority.
They establish neither exactly-once behavior at a real external service nor
outside adoption. A useful next result is the same interruption test on one
builder's sandbox operation, including the provider lookup that resolves it.
