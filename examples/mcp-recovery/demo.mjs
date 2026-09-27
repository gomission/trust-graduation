import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runTurnRecoveryDemo } from "../../src/turn-demo.js";

const report = await runTurnRecoveryDemo({
  adapterPath: fileURLToPath(new URL("./adapter.mjs", import.meta.url)),
  ...(process.argv[2] ? { outputDir: process.argv[2] } : {}),
  log: line => console.log(line)
});
const sessions = report.scenarios.flatMap(scenario => {
  const dir = path.join(report.evidenceDirectory, scenario.id, "mcp-sessions");
  return fs.existsSync(dir) ? fs.readdirSync(dir).map(file => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))) : [];
});
assert.ok(sessions.some(session => session.tool === "send_message"));
assert.ok(sessions.some(session => session.tool === "lookup_message"));
for (const session of sessions) {
  assert.equal(session.server.name, "synthetic-message-provider");
  assert.notEqual(session.clientPid, session.providerPid);
}
const proof = { ...report, integration: "official-mcp-typescript-sdk-2.1.0-stdio",
  externalActions: 0, syntheticBusinessProvider: true, syntheticApprovalAuthority: true, sessions };
fs.writeFileSync(path.join(report.evidenceDirectory, "mcp-result.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log(`MCP_RECOVERY_RESULT ${JSON.stringify(proof)}`);
