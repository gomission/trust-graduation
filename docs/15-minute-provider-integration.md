# Fifteen-Minute Provider Gate Integration

Status: experimental beta integration path. Passing the local runner is not
independent adoption, a security certification, or proof of a durable
production deployment.

The objective is narrow: place one exact-action authority boundary immediately
before one existing provider function and obtain machine-readable evidence that
missing approval, mutation, issuer-authentication failure, storage failure,
replay, and a racing duplicate cannot call that provider.

## Minute 0–2: install and scaffold

Requirements: Node.js 20 or newer and an existing JavaScript project.

```bash
npm install @trust-graduation/core@beta
npx trust-graduation init-adapter
```

The second command creates `mission-gate-adapter.mjs` and refuses to overwrite
an existing file.

## Minute 2–7: map the existing provider input

Open `mission-gate-adapter.mjs`. Keep the injected `provider`, atomic `store`,
`authenticateGrant`, and `writeReceipt` dependencies. Change only
`mapProviderInput()` so its return value matches the arguments already accepted
by the provider seam.

The production composition supplies the real dependencies:

```js
import { createGate } from "./mission-gate-adapter.mjs";

const gate = createGate({
  provider: existingProviderFunction,
  store: sharedAtomicGrantStore,
  authenticateGrant: verifyApprovalIssuer,
  writeReceipt: durableReceiptSink
});
```

`sharedAtomicGrantStore.consume()` must atomically reject revoked or previously
consumed issuer + tenant + grant identities across every executor. The bundled
memory store is for conformance and single-process demos only.

## Minute 7–11: prepare the exact action

Before presenting the request for review, normalize every field that can change
the provider effect:

```js
const action = {
  actionClass: "github.review-comment.create",
  workspace: "workspace-1",
  principal: "principal-1",
  requestedBy: "review-agent",
  tenant: "organization-1",
  target: "owner/repo#123",
  input: { owner, repo, pull_number, body, commit_id, path, line },
  constraints: { scope: "once", sandbox: true }
};

const binding = gate.prepare(action);
await presentBindingForAuthenticatedApproval(binding);
```

The authenticated approval service returns a single-use grant for that exact
binding. A chat reply or `{ state: "approved" }` is not a grant.

## Minute 11–13: replace the direct provider call

At the last application-controlled seam before the provider:

```js
const execution = await gate.execute({ binding, approval, action });

if (!execution.ok) {
  throw new Error(`provider held: ${execution.reason}`);
}

return execution.providerResult;
```

`execute()` re-binds the actual input, validates and authenticates the grant,
atomically consumes it, invokes the provider, hashes JSON-compatible provider
evidence, and sends a result-linked receipt to the required receipt sink.

The reference receipt is result-linked but not cryptographically signed by
this helper. A production sink should sign or wrap it with the organization's
receipt scheme. The helper provides at-most-once authority consumption, not
exactly-once provider effects: a process failure between consume, provider
response, and durable receipt storage still requires an execution journal and
provider reconciliation.

If the provider throws after invocation, the result is
`provider_outcome_unknown`; reconcile it instead of replaying. If receipt
storage fails after a confirmed provider response, execution reports
`receipt_store_unavailable_after_provider` rather than false success.

## Minute 13–15: run the boundary contract

```bash
npx trust-graduation conformance ./mission-gate-adapter.mjs --json
```

Success prints one `CONFORMANCE_RESULT` with `"ok":true`. Provider counters
must remain zero after missing approval, mutation, issuer rejection, and atomic
store failure; remain one after replay; and become two—not three—after two new
consumers race for a second grant. Two result-linked receipts must exist.

The runner imports and executes the local adapter module. Review that file just
as you would any test program before running it.

## What to return for independent proof

- repository and immutable commit;
- exact provider function wrapped;
- unedited conformance result;
- durable store and approval-authentication mechanism used outside the runner;
- one redacted action hash and provider result/receipt correlation;
- elapsed integration time;
- `keep`, `remove`, or `native controls already make this redundant`, with the
  reason.

The conformance runner proves the adapter contract against an instrumented
provider. A real integration is complete only when the same factory is composed
around the repository's existing sandbox provider call.

## Optional MCP-to-provider round trip

When the proposed action begins at an MCP interception boundary, install both
open packages and run the included bridge proof:

```bash
npm install @gomission/mcp@beta @trust-graduation/core@beta
node node_modules/@trust-graduation/core/examples/mcp-provider-roundtrip.mjs
```

It takes the exact binding emitted by `@gomission/mcp`, maps the actual provider
input through `providerActionFromMcpBinding()`, rejects mutation, executes the
unchanged action once through `createProviderGate()`, rejects replay, and writes
one result-linked receipt. It uses process-local test dependencies and remains
a package-compatibility proof rather than an external integration.
