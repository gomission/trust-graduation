# Approval recovery over MCP stdio

This reference uses the official TypeScript SDK's separate client and server
packages, pinned to 2.1.0. The client spawns a separate local MCP provider. The
business effect is a synthetic message ledger, and decisions use the public
test authority from the turn fixture. No email is sent and no real human is
authenticated. The core package still has no runtime dependencies.

Requirements: Git, Node.js 20+ and macOS/Linux (or WSL), plus npm registry access
for installation. From the repository root:

```bash
npm ci --prefix examples/mcp-recovery --ignore-scripts
npm run demo --prefix examples/mcp-recovery
```

To choose a new evidence directory:

```bash
npm run demo --prefix examples/mcp-recovery -- ./mcp-proof
```

The four checks run in fresh host processes. In the response-loss case, the MCP
server persists its effect, signals the test driver through stderr and withholds
its response. The driver kills the client process with SIGKILL. A new client
queries `lookup_message` over a new MCP connection; it does not retry
`send_message`. The parent then compares the provider ledger with the host's
separate receipt. There is one send invocation across the recovery and replay.

`MCP_RECOVERY_RESULT` is printed only after verification. Its evidence directory
contains `mcp-result.json` and each scenario's host journal, provider ledger,
receipts and `mcp-sessions/` records. Session records identify separate client
and server processes and the tool called. They supplement, not replace, the
independent provider and receipt checks.

The server uses the SDK's `serveStdio` factory; the client uses `Client` and
`StdioClientTransport`. It treats `isError` as a tool failure and parses a
successful tool response before using it. Closing stdin after client death lets
the server exit without a long-lived approval wait. Approval itself never
travels through the model or this MCP server.

To adapt this to an application, replace the test authority with the host's
authenticated decision channel and replace the synthetic provider/lookup with
one sandbox operation and its authoritative status lookup. Keep the execution
claim, atomic grant consumption, receipt readback and unknown-outcome behavior.
Do not infer permission to retry from a missing record. This example does not
cover remote HTTP reconnects, distributed storage, production identities or a
specific agent framework's turn scheduler.

Sources: [official SDK](https://github.com/modelcontextprotocol/typescript-sdk),
[client guide](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client.html),
[workflow contract](../../docs/turn-boundary-recovery.md).
