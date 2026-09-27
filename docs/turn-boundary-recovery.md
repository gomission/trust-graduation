# Approval and receipt recovery across turns

This reference implements the disconnect test proposed in
[browser-use discussion #5024](https://github.com/browser-use/browser-use/discussions/5024#discussioncomment-18623032).
It composes the existing `createProviderGate` with persisted workflow state.
It is an executable single-host example, not a completed browser-use integration
or a guarantee of exactly-once delivery by an external service.

## Run the proof

From this source checkout, with Node.js 18+ on a local POSIX filesystem:

```bash
npm run test:turns
```

The tests start a new Node process for each request, human-decision fixture,
and resume. At selected checkpoints the parent sends `SIGKILL` and waits for
the child and its IPC connection to close before starting the next process.
The pending request and the human decision therefore cannot survive only in a
live socket, promise, or in-memory object.

The provider is a separate on-disk synthetic message ledger. No email, purchase,
browser account, credentials, or paid service is used. The fixed test signing
key authenticates only fixture decisions and must never be used in production.

## Contract

`examples/turn-boundary/workflow.mjs` exposes `createTurnWorkflow`:

- `request({ requestId, policyId, action })` persists the exact action and returns
  `pending_approval` immediately. End the agent turn here. Keep `requestId`
  stable across transport retries; changed arguments or policy under the same
  identifier are rejected. Policy ID is included in the action's hashed constraints.
- `decide({ requestId, decision })` is called by the separate trusted approval
  host. The callback authenticates a decision bound to the request ID, policy,
  and action hash. An approval also carries an exact-action grant. A denial is
  persisted in `failed[]`. Repeated identical decisions are idempotent; an
  already-committed decision cannot be replaced.
- `resume(requestId)` reloads state in a new turn. An atomic persisted execution
  claim and the gate's atomic grant consumption precede provider I/O. A second
  consumer cannot call the provider again.
- `reconcile(requestId)` reads provider-owned evidence and a separately persisted
  receipt. Completion requires agreement on the action, grant, and result hash.
  Reconciliation may write a recovery receipt when the provider accepted the
  action but the original receipt was lost. It then reads that artifact back.
- `inspect(requestId)` exposes the current state and the durable `failed[]`
  history, including approval failures, denials, and unknown execution outcomes.

The injected `authenticateDecision` and `lookupProviderEvidence` functions are
trust boundaries. The latter must query application/provider-owned state for
the exact action, not ask the agent whether it succeeded. Its returned envelope
contains `actionHash`, `inputHash`, and `result`; the result hash must match the
persisted receipt. The reference provider returns the same result object that
its independent lookup exposes.

## What the tests establish

| Interruption or error | Required behavior |
| --- | --- |
| Death after pending request, before response delivery | Same request is recovered with the same binding; zero provider calls |
| Death after approval decision, before resume | New process resumes the persisted decision |
| Concurrent resumes and later replay | One provider call for the request |
| Death after provider acceptance, before receipt | Lookup recovers confirmation; no resend |
| Death after receipt write, before completion | Receipt is read and verified; no resend |
| Death before provider accepts | Explicit unknown outcome; reconciliation required; no blind retry |
| Human denial | Durable `failed[]` entry; zero provider calls |
| Forged approval, expiry, or grant-store failure | Persisted failure; zero provider calls |
| Agent/tool reports success without provider evidence | Unknown outcome, never completed |
| Receipt store fails or claims a write without saving it | Never completed until durable readback succeeds |
| Stored receipt disagrees with provider evidence | Verification failure; no resend |
| Arguments or policy change under an existing request ID | Conflict; no new request or effect |
| Stale lookup returns after a newer verified result | Cannot overwrite the newer completion |
| Retry of a persisted decision after grant expiry | Same decision history; execution still fails on expiry |

## Persistence and limits

`file-store.mjs` is a reference for a private directory owned by one trusted
application on one machine. Requests, decisions, execution claims, and failure
history are immutable numbered revisions. Each revision is written and flushed
to a temporary file, then atomically published with a non-overwriting hard link.
Competing writers attempt the same next revision; one wins. A dead writer can
leave an ignored temporary file, not a visible partial record or a lock that
another executor must guess is stale. Grant consumption uses the same
non-overwriting publication mechanism. Receipts are separate files.

This example assumes a trusted local directory and a POSIX filesystem with
atomic hard links; it does not cover network filesystems, disk loss, malicious
filesystem writers, distributed consensus, production identity or revocation,
or retention/cleanup. Use a transactional database or equivalent durable store
for a distributed host, with atomic claim/consume semantics shared by all executors.

A crash between claiming execution and contacting the provider is inherently
ambiguous after restart. The example exposes `outcome_unknown` and
`reconciliationRequired: true`; it does not silently drop the request or assume
that a missing provider record proves the effect cannot appear later. A real
integration needs a provider-specific reconciliation policy or idempotency key
before any retry. The test proves at most one invocation through this workflow,
not global exactly-once effects. Separate request IDs are separate operations.

Nothing here registers an agent-callable approval tool or changes the public
MCP wrapper into an executor. The next integration step is to supply the actual
runtime's turn handling, trusted human-decision channel, and one provider's
confirmation lookup, then run the same interruption matrix there.
