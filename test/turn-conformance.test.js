import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const workflowUrl = new URL("../examples/turn-boundary/workflow.mjs", import.meta.url).href;

test("external adapter is loaded in fresh processes and checked against persisted evidence", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tg-external-adapter-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const adapter = path.join(root, "adapter.mjs");
  const starts = path.join(root, "starts.txt");
  fs.writeFileSync(adapter, `import fs from 'node:fs';
import {createTurnWorkflow} from ${JSON.stringify(workflowUrl)};
fs.appendFileSync(${JSON.stringify(starts)}, process.pid+'\\n');
export const createWorkflow = dependencies => createTurnWorkflow(dependencies);`);
  const run = spawnSync(process.execPath, [cli, "conformance-turns", adapter, "--json"], { encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout.trim().replace(/^TURN_CONFORMANCE_RESULT /, ""));
  t.after(() => fs.rmSync(report.evidenceDirectory, { recursive: true, force: true }));
  assert.equal(report.ok, true);
  assert.equal(report.adapter, adapter);
  const processes = fs.readFileSync(starts, "utf8").trim().split("\n");
  assert.ok(processes.length >= 4);
  assert.equal(new Set(processes).size, processes.length);
  assert.deepEqual(report.scenarios.map(s => s.providerCalls), [1, 1, 0, 0]);
});

test("adapter claiming completion without a provider effect fails conformance", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tg-lying-adapter-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const adapter = path.join(root, "adapter.mjs");
  fs.writeFileSync(adapter, `import {createTurnWorkflow} from ${JSON.stringify(workflowUrl)};
export function createWorkflow(dependencies) {
 const flow=createTurnWorkflow(dependencies);
 return {...flow, async resume(id) {
  const state=dependencies.store.get(id);
  dependencies.store.compareAndSet(id,state.revision,{...state,status:'completed'});
  return dependencies.store.get(id);
 }};
}`);
  const run = spawnSync(process.execPath, [cli, "conformance-turns", adapter, "--output", path.join(root, "proof"), "--json"], { encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Recovery demo failed/);
  assert.equal(fs.existsSync(path.join(root, "proof", "result.json")), false);
});
