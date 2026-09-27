import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { digestObject } from "../src/index.js";
import { createFileTurnStore } from "../examples/turn-boundary/file-store.mjs";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("recovery CLI reports independently readable provider and receipt artifacts", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tg-demo-test-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const output = path.join(parent, "proof");
  const run = spawnSync(process.execPath, [cli, "turn-demo", "--output", output, "--json"], {
    cwd: parent, encoding: "utf8", timeout: 30000
  });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout.trim().replace(/^TURN_RECOVERY_RESULT /, ""));
  assert.equal(report.ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, "result.json"))), report);
  assert.equal(report.scenarios.length, 4);
  for (const scenario of report.scenarios) {
    const state = createFileTurnStore(path.join(output, scenario.id, "host")).get("message-1");
    assert.equal(state.status, scenario.status);
    if (state.status === "completed") {
      const receipt = createFileTurnStore(path.join(output, scenario.id, "host")).readReceipt("message-1");
      const evidence = createFileTurnStore(path.join(output, scenario.id, "provider")).get(state.binding.actionHash.slice(7));
      assert.equal(receipt.providerResultHash, digestObject(evidence.result));
      assert.equal(fs.readdirSync(path.join(output, scenario.id, "provider", "calls")).length, 1);
    } else {
      assert.equal(fs.existsSync(path.join(output, scenario.id, "provider", "calls")), false);
      assert.ok(state.failed.length > 0);
    }
  }
  assert.deepEqual(report.scenarios.map(s => s.status), ["completed", "completed", "denied", "outcome_unknown"]);
  const retry = spawnSync(process.execPath, [cli, "turn-demo", "--output", output], { encoding: "utf8" });
  assert.equal(retry.status, 1);
  assert.match(retry.stderr, /already exists/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, "result.json"))), report);
});

test("recovery CLI rejects a missing output path before running workers", () => {
  const run = spawnSync(process.execPath, [cli, "turn-demo", "--output"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--output requires/);
});
