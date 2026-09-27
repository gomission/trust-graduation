// A synthetic message provider behind a real MCP stdio transport. It never
// sends mail. Its ledger is deliberately separate from the approval host.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { digestObject } from "../../src/index.js";
import { createFileTurnStore } from "../turn-boundary/file-store.mjs";

const [root, mode = "normal"] = process.argv.slice(2);
if (!root) throw new Error("provider workspace required");
const ledger = createFileTurnStore(path.join(root, "provider"));
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const response = value => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

serveStdio(() => {
  const server = new McpServer({ name: "synthetic-message-provider", version: "1.0.0" });
  server.registerTool("send_message", {
    description: "Record one synthetic message; never sends email.",
    inputSchema: z.object({ actionHash: hash, inputHash: hash, nonce: z.string(),
      input: z.object({ to: z.literal("recipient@example.invalid"), body: z.string() }) })
  }, async ({ actionHash, inputHash, nonce, input }) => {
    if (digestObject(input) !== inputHash) throw new Error("provider_input_hash_mismatch");
    const calls = path.join(root, "provider", "calls");
    fs.mkdirSync(calls, { recursive: true });
    fs.writeFileSync(path.join(calls, crypto.randomUUID()), JSON.stringify(input), { flag: "wx", mode: 0o600 });
    const evidence = { actionHash, inputHash, result: { providerId: `message-${nonce}`, delivered: true } };
    if (!ledger.create(actionHash.slice(7), evidence)) throw new Error("duplicate_provider_call");
    if (mode === "pause-provider_accepted") {
      // The host is killed only AFTER this provider has persisted its effect,
      // but BEFORE its MCP reply. An unresolved promise keeps no extra handle;
      // the SDK closes the server when the killed client's stdin pipe ends.
      process.stderr.write("PROVIDER_ACCEPTED\n");
      await new Promise(() => {});
    }
    return response(evidence.result);
  });
  server.registerTool("lookup_message", {
    description: "Read provider-owned evidence without resending.",
    inputSchema: z.object({ actionHash: hash })
  }, async ({ actionHash }) => response(ledger.get(actionHash.slice(7))));
  return server;
});
