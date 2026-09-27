import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createTurnWorkflow } from "../turn-boundary/workflow.mjs";

// The conformance fixture passes workspace and interruption mode to each new
// host process. Only this example adapter uses that test-process convention.
const [root, , mode = "normal"] = process.argv.slice(2);
const providerPath = fileURLToPath(new URL("./provider.mjs", import.meta.url));

async function call(name, args) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [providerPath, root, mode], stderr: "pipe" });
  let stderr = "";
  transport.stderr.on("data", chunk => {
    stderr += chunk;
    if (stderr.includes("PROVIDER_ACCEPTED\n")) {
      process.send?.({ checkpoint: "provider_accepted" });
    }
  });
  const client = new Client({ name: "mission-recovery-host", version: "1.0.0" });
  try {
    await client.connect(transport);
    const sessions = path.join(root, "mcp-sessions");
    fs.mkdirSync(sessions, { recursive: true });
    fs.writeFileSync(path.join(sessions, `${crypto.randomUUID()}.json`), JSON.stringify({
      clientPid: process.pid, providerPid: transport.pid, tool: name,
      server: client.getServerVersion()
    }, null, 2), { flag: "wx", mode: 0o600 });
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`MCP tool failed: ${JSON.stringify(result.content)}`);
    if (result.content?.length !== 1 || result.content[0].type !== "text") throw new Error("unexpected_mcp_result");
    return JSON.parse(result.content[0].text);
  } finally {
    await client.close();
  }
}

export function createWorkflow(dependencies) {
  return createTurnWorkflow({ ...dependencies,
    provider: async (input, { binding }) => {
      if (mode === "pause-before-provider") {
        process.send?.({ checkpoint: "before_provider" });
        setInterval(() => {}, 1000);
        await new Promise(() => {});
      }
      return call("send_message", { input, actionHash: binding.actionHash,
        inputHash: binding.inputHash, nonce: binding.nonce });
    },
    lookupProviderEvidence: record => call("lookup_message", { actionHash: record.binding.actionHash })
  });
}
