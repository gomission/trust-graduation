// A guided synthetic proof. Workers, decisions, and provider evidence all use
// the same fixture as the crash tests; no external messages are sent.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { digestObject } from "./index.js";
import { createFileTurnStore } from "../examples/turn-boundary/file-store.mjs";

const defaultWorker = fileURLToPath(new URL("../examples/turn-boundary/fixture-worker.mjs", import.meta.url));

function runWorker(worker, adapterPath, root, command, mode = "normal", killAt = "") {
  return new Promise((resolve, reject) => {
    const child = fork(worker, [root, command, mode, adapterPath || ""], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let result, reached;
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 10000);
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("message", message => {
      if (killAt && message.checkpoint === killAt) {
        reached = message.checkpoint;
        child.kill("SIGKILL");
      }
      if (message.result) result = message.result;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error(`Worker timed out: ${command}`));
      if (killAt && reached === killAt && signal === "SIGKILL") return resolve({ checkpoint: reached, signal });
      if (!killAt && code === 0 && result) return resolve(result);
      reject(new Error(`Worker failed: ${command} (${signal || code}) ${stderr}`));
    });
  });
}

function inspect(root) {
  const store = createFileTurnStore(path.join(root, "host"));
  const state = store.get("message-1");
  const receipt = store.readReceipt("message-1");
  const calls = path.join(root, "provider", "calls");
  return { state, receipt, providerCalls: fs.existsSync(calls) ? fs.readdirSync(calls).length : 0 };
}

function verifyCompletion(root) {
  const { state, receipt, providerCalls } = inspect(root);
  const evidence = createFileTurnStore(path.join(root, "provider")).get(state.binding.actionHash.slice(7));
  assert.equal(state.status, "completed");
  assert.equal(providerCalls, 1);
  assert.equal(receipt.actionHash, state.binding.actionHash);
  assert.equal(receipt.grantId, state.decision.approval.grantId);
  assert.equal(receipt.outcome, "provider_confirmed");
  assert.equal(evidence.actionHash, state.binding.actionHash);
  assert.equal(evidence.inputHash, state.binding.inputHash);
  assert.equal(receipt.providerResultHash, digestObject(evidence.result));
  return { status: state.status, providerCalls, receiptVerified: true };
}

export async function runTurnRecoveryDemo({ outputDir, adapterPath, workerPath = defaultWorker, log = () => {} } = {}) {
  if (process.platform === "win32") throw new Error("turn-demo requires macOS or Linux with a local POSIX filesystem; on Windows use WSL.");
  const adapter = adapterPath ? path.resolve(adapterPath) : undefined;
  if (adapter) fs.accessSync(adapter, fs.constants.R_OK);
  const run = (...args) => runWorker(workerPath, adapter, ...args);
  let root;
  if (outputDir !== undefined) {
    root = path.resolve(outputDir);
    try { fs.mkdirSync(root, { mode: 0o700 }); }
    catch (error) {
      if (error.code === "EEXIST") throw new Error(`Output directory already exists: ${root}. Choose a new directory; existing evidence is never overwritten.`);
      throw error;
    }
  } else root = fs.mkdtempSync(path.join(os.tmpdir(), "trust-graduation-recovery-"));
  log(adapter ? "Testing an adapter with a synthetic provider and test authority. Only injected provider calls are measured."
    : "Synthetic provider and test approval authority. No external messages are sent.");
  log(`Evidence directory: ${root}`);
  const scenarios = [];

  const resumed = path.join(root, "resumed");
  const pendingKill = await run(resumed, "request", "pause-pending", "pending_persisted");
  const pending = inspect(resumed);
  assert.equal(pending.state.status, "pending_approval");
  assert.equal(pending.providerCalls, 0);
  const repeat = await run(resumed, "request");
  assert.equal(repeat.binding.actionHash, pending.state.binding.actionHash);
  const approvedKill = await run(resumed, "approve", "pause-decision", "decision_persisted");
  assert.equal(inspect(resumed).state.status, "approved");
  await run(resumed, "resume");
  await run(resumed, "resume");
  scenarios.push({ id: "resumed", ...verifyCompletion(resumed), kills: [pendingKill, approvedKill] });
  log("1. Request + approval survive SIGKILL -> completed; replay keeps provider calls at 1.");

  const reconciled = path.join(root, "reconciled");
  await run(reconciled, "request");
  await run(reconciled, "approve");
  const acceptedKill = await run(reconciled, "resume", "pause-provider_accepted", "provider_accepted");
  assert.equal(inspect(reconciled).receipt, null);
  assert.equal(inspect(reconciled).providerCalls, 1);
  await run(reconciled, "resume");
  await run(reconciled, "resume");
  scenarios.push({ id: "reconciled", ...verifyCompletion(reconciled), kills: [acceptedKill] });
  log("2. Provider accepts, worker dies before receipt -> recovered receipt verified; provider calls stay at 1.");

  const denied = path.join(root, "denied");
  await run(denied, "request");
  const deniedKill = await run(denied, "deny", "pause-decision", "decision_persisted");
  await run(denied, "resume");
  const denial = inspect(denied);
  assert.equal(denial.state.status, "denied");
  assert.equal(denial.providerCalls, 0);
  assert.ok(denial.state.failed.some(entry => entry.reason === "human_denied"));
  scenarios.push({ id: "denied", status: denial.state.status, providerCalls: denial.providerCalls,
    failed: denial.state.failed.map(entry => entry.reason), kills: [deniedKill] });
  log("3. Denial survives restart -> denied, failed[] contains human_denied; provider calls: 0.");

  const unknown = path.join(root, "unknown");
  await run(unknown, "request");
  await run(unknown, "approve");
  const unknownKill = await run(unknown, "resume", "pause-before-provider", "before_provider");
  await run(unknown, "resume");
  await run(unknown, "resume");
  const unresolved = inspect(unknown);
  assert.equal(unresolved.state.status, "outcome_unknown");
  assert.equal(unresolved.state.reconciliationRequired, true);
  assert.equal(unresolved.providerCalls, 0);
  assert.ok(unresolved.state.failed.some(entry => entry.reason === "provider_evidence_unavailable"));
  scenarios.push({ id: "unknown", status: unresolved.state.status, providerCalls: unresolved.providerCalls,
    reconciliationRequired: true, failed: unresolved.state.failed.map(entry => entry.reason), kills: [unknownKill] });
  log("4. Worker dies before provider acceptance -> outcome_unknown; no blind retry; provider calls: 0.");

  const report = { protocol: adapter ? "trust-graduation-turn-recovery-conformance" : "trust-graduation-turn-recovery-demo", version: 1, ok: true,
    synthetic: true, externalActions: adapter ? null : 0, evidenceDirectory: root, ...(adapter ? { adapter } : {}), scenarios };
  // The report is an index. The separate host journal, provider ledger, and
  // receipt files remain available for inspection; it does not replace them.
  const reportPath = path.join(root, "result.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  assert.deepEqual(JSON.parse(fs.readFileSync(reportPath, "utf8")), report);
  log(`All four scenarios verified. Read ${reportPath}`);
  return report;
}
