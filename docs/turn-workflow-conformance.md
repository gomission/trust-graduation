# Run interruption checks against a workflow adapter

The provider runner checks authorization at one call boundary. The turn runner
checks recovery across separate processes. Both use synthetic providers and
test authority; neither certifies a deployment or authenticates a real human.

From this checkout, on Node.js 18+ and a local POSIX filesystem:

```bash
node src/cli.js conformance-turns ./examples/turn-workflow-adapter.mjs --json
```

For your own adapter after installing `@trust-graduation/core@0.2.0-beta.5`:

```bash
npx trust-graduation conformance-turns ./adapter.mjs --output ./adapter-proof
```

The adapter exports `createWorkflow(dependencies)`. Each request, decision and
resume loads it in a fresh process. The factory may be asynchronous and returns
`request`, `decide`, `resume`, `reconcile`, and `inspect`, following the
[reference workflow contract](turn-boundary-recovery.md#contract).

Dependencies are `store`, `now`, `authenticateDecision`, `provider`, and
`lookupProviderEvidence`. Use the injected authority and provider seams. The
store and persisted records currently follow the reference schema (request ID,
revision, binding, decision, status, failed history, separate receipt). An
existing runtime needs a mapping to that schema; this is not a drop-in tester
for arbitrary frameworks. Keep application credentials out of the test.

The runner verifies these four cases against the supplied store and provider
ledger, rather than trusting a returned `completed` flag:

| Case | Required result |
| --- | --- |
| Kill after pending request and after approval | Restart completes; replay causes one provider call total |
| Kill after provider commit, before receipt | Lookup recovers a matching receipt; one provider call total |
| Kill after denial | Denial persists in `failed[]`; zero provider calls |
| Kill after claiming execution, before provider I/O | Unknown outcome remains visible; zero automatic resends |

Success emits `TURN_CONFORMANCE_RESULT` and retains `result.json`, host records,
provider records and receipts. Failure exits nonzero and leaves partial
evidence without a success report. Existing output directories are rejected.
The package's tests include an adapter that invents completion; it fails.

The runner can count only its injected provider. It cannot detect unrelated
I/O performed by arbitrary adapter code. A passing fixture also cannot establish
your production storage durability, identity, revocation or provider lookup.
The narrower authorization matrix remains a separate command:

```bash
npx trust-graduation conformance ./provider-adapter.mjs --json
```

For a complete transport example, see [MCP recovery](../examples/mcp-recovery/README.md).
