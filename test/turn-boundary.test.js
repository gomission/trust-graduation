import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createFileTurnStore } from "../examples/turn-boundary/file-store.mjs";
import { createTurnWorkflow } from "../examples/turn-boundary/workflow.mjs";
import { createApprovalGrant } from "../src/index.js";

const worker = fileURLToPath(new URL("../examples/turn-boundary/fixture-worker.mjs", import.meta.url));

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tg-turn-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(root, command, mode = "normal", killAt = "") {
  return new Promise((resolve, reject) => {
    const child = fork(worker, [root, command, mode], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
    let result;
    let stderr = "";
    let checkpoint;
    child.stderr.on("data", chunk => { stderr += chunk; });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`worker timeout: ${command}`)); }, 10000);
    child.on("error", reject);
    child.on("message", message => {
      if (message.checkpoint === killAt && killAt) {
        checkpoint = message;
        child.kill("SIGKILL");
      }
      if (message.result) result = message.result;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (killAt) {
        if (checkpoint && signal === "SIGKILL") resolve(checkpoint);
        else reject(new Error(`missing checkpoint ${killAt}: ${stderr}`));
      } else if (code === 0 && result) resolve(result);
      else reject(new Error(`worker failed (${code}): ${stderr}`));
    });
  });
}

function calls(root) {
  const dir = path.join(root, "provider", "calls");
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
}

async function approve(root) {
  await run(root, "request");
  return run(root, "approve");
}

test("approval returns pending, survives SIGKILL and resumes once in fresh processes", async t => {
  const root = workspace(t);
  await run(root, "request", "pause-pending", "pending_persisted");
  const pending = createFileTurnStore(path.join(root, "host")).get("message-1");
  assert.equal(pending.status, "pending_approval");
  assert.equal(pending.policyId, "human-message-v1");
  assert.match(pending.binding.inputHash, /^sha256:/);
  assert.equal(calls(root), 0);
  const duplicate = await run(root, "request");
  assert.equal(duplicate.binding.actionHash, pending.binding.actionHash);
  await run(root, "approve", "pause-decision", "decision_persisted");
  const completed = await run(root, "resume");
  assert.equal(completed.status, "completed");
  const receipt = createFileTurnStore(path.join(root, "host")).readReceipt("message-1");
  assert.equal(receipt.actionHash, pending.binding.actionHash);
  assert.equal(receipt.outcome, "provider_confirmed");
  assert.equal((await run(root, "resume")).status, "completed");
  assert.equal(calls(root), 1);
});

test("denied decisions persist in failed[] and never reach the provider", async t => {
  const root = workspace(t);
  await run(root, "request");
  await run(root, "deny", "pause-decision", "decision_persisted");
  const result = await run(root, "resume");
  assert.equal(result.status, "denied");
  assert.equal(result.failed[0].reason, "human_denied");
  assert.equal(calls(root), 0);
});

test("concurrent fresh executors share a durable claim", async t => {
  const root = workspace(t);
  await approve(root);
  await Promise.all([run(root, "resume"), run(root, "resume")]);
  assert.equal((await run(root, "resume")).status, "completed");
  assert.equal(calls(root), 1);
});

for (const point of ["provider_accepted", "receipt_persisted"]) {
  test(`SIGKILL at ${point} is reconciled using provider evidence without resending`, async t => {
    const root = workspace(t);
    await approve(root);
    await run(root, "resume", `pause-${point}`, point);
    const recovered = await run(root, "resume");
    assert.equal(recovered.status, "completed");
    assert.equal((await run(root, "resume")).status, "completed");
    assert.equal(calls(root), 1);
  });
}

test("death before the provider leaves visible unknown work and cannot blindly retry", async t => {
  const root = workspace(t);
  await approve(root);
  await run(root, "resume", "pause-before-provider", "before_provider");
  const result = await run(root, "resume");
  assert.equal(result.status, "outcome_unknown");
  assert.equal(result.reconciliationRequired, true);
  assert.ok(result.failed.some(entry => entry.reason === "provider_evidence_unavailable"));
  assert.equal((await run(root, "resume")).status, "outcome_unknown");
  assert.equal(calls(root), 0);
});

test("a tool claiming success without provider evidence is not completion", async t => {
  const root = workspace(t);
  await approve(root);
  const result = await run(root, "resume", "false-success");
  assert.equal(result.status, "outcome_unknown");
  assert.ok(result.failed.some(entry => entry.reason === "provider_evidence_unavailable"));
  assert.equal(calls(root), 0);
});

test("failed authorization is recorded and cannot execute", async t => {
  const root = workspace(t);
  await run(root, "request");
  const failed = await run(root, "approve", "forged-decision");
  assert.equal(failed.status, "pending_approval");
  assert.equal(failed.failed[0].reason, "decision_not_authenticated");
  assert.equal((await run(root, "resume")).status, "pending_approval");
  assert.equal(calls(root), 0);
});

test("expired approval is a persisted failure before the provider", async t => {
  const root = workspace(t);
  await approve(root);
  const result = await run(root, "resume", "expired");
  assert.equal(result.status, "failed");
  assert.equal(result.failed[0].reason, "grant_expired");
  assert.equal(calls(root), 0);
});

test("receipt readback catches a corrupt receipt rather than trusting completed state", async t => {
  const root = workspace(t);
  await approve(root);
  await run(root, "resume");
  const store = createFileTurnStore(path.join(root, "host"));
  const receipt = store.readReceipt("message-1");
  store.writeReceipt("message-1", { ...receipt, actionHash: "sha256:wrong" });
  const result = await run(root, "resume");
  assert.equal(result.status, "outcome_unknown");
  assert.ok(result.failed.some(entry => entry.reason === "receipt_verification_failed"));
  assert.equal(calls(root), 1);
});

test("request id cannot be reused for changed arguments or policy", async t => {
  const root = workspace(t);
  await run(root, "request");
  await assert.rejects(run(root, "request", "changed-input"), /request_id_conflict/);
  await assert.rejects(run(root, "request", "changed-policy"), /request_id_conflict/);
  assert.equal(calls(root), 0);
});

test("a failed grant store is recorded before provider invocation", async t => {
  const root = workspace(t);
  await approve(root);
  const result = await run(root, "resume", "grant-store-offline");
  assert.equal(result.status, "failed");
  assert.equal(result.failed[0].reason, "grant_store_unavailable");
  assert.equal(calls(root), 0);
});

for (const mode of ["receipt-store-offline", "receipt-store-lies"]) {
  test(`${mode} cannot produce completion and recovers without another send`, async t => {
    const root = workspace(t);
    await approve(root);
    const result = await run(root, "resume", mode);
    assert.equal(result.status, "outcome_unknown");
    assert.ok(result.failed.length > 0);
    assert.equal((await run(root, "resume")).status, "completed");
    assert.equal(calls(root), 1);
  });
}

test("a stale reconciliation failure cannot overwrite a newer verified completion", async t => {
  const root = workspace(t);
  await approve(root);
  await run(root, "resume");
  const store = createFileTurnStore(path.join(root, "host"));
  let release;
  let started;
  const waiting = new Promise(resolve => { started = resolve; });
  const workflow = createTurnWorkflow({
    store, authenticateDecision: async () => true,
    provider: async () => { throw new Error("must_not_send"); },
    lookupProviderEvidence: async () => {
      started();
      await new Promise(resolve => { release = resolve; });
      return null;
    }
  });
  const stale = workflow.reconcile("message-1");
  await waiting;
  assert.equal((await run(root, "resume")).status, "completed");
  release();
  assert.equal((await stale).status, "completed");
  assert.equal(store.get("message-1").status, "completed");
  assert.equal(calls(root), 1);
});

test("an already persisted decision remains idempotent after its grant expires", async t => {
  const root = workspace(t);
  let time = new Date("2026-09-27T12:00:00Z");
  const workflow = createTurnWorkflow({
    store: createFileTurnStore(root), now: () => time,
    authenticateDecision: async () => true,
    provider: async () => { throw new Error("must_not_send"); },
    lookupProviderEvidence: async () => null
  });
  const record = workflow.request({ requestId: "repeat", policyId: "policy-v1", action: {
    actionClass: "email.send.external", workspace: "test", target: "test@example.invalid", input: {}
  } });
  const decision = {
    requestId: "repeat", policyId: "policy-v1", actionHash: record.binding.actionHash,
    state: "approved", approval: createApprovalGrant({
      binding: record.binding, issuer: "test-authority", grantId: "repeat-grant", issuedAt: time.toISOString()
    })
  };
  const approved = await workflow.decide({ requestId: "repeat", decision });
  time = new Date("2026-09-27T12:11:00Z");
  assert.deepEqual(await workflow.decide({ requestId: "repeat", decision }), approved);
  assert.equal((await workflow.resume("repeat")).status, "failed");
});

test("a late provider failure cannot undo a concurrently reconciled completion", async t => {
  const root = workspace(t);
  const store = createFileTurnStore(root);
  const now = () => new Date("2026-09-27T12:00:00Z");
  let evidence, release, accepted, providerCalls = 0;
  const providerAccepted = new Promise(resolve => { accepted = resolve; });
  const workflow = createTurnWorkflow({
    store, now, authenticateDecision: async () => true,
    provider: async (input, { binding }) => {
      providerCalls++;
      evidence = { actionHash: binding.actionHash, inputHash: binding.inputHash,
        result: { providerId: "accepted-before-response-loss" } };
      accepted();
      await new Promise(resolve => { release = resolve; });
      throw new Error("response_lost_after_acceptance");
    },
    lookupProviderEvidence: async () => evidence
  });
  const record = workflow.request({ requestId: "late", policyId: "policy-v1", action: {
    actionClass: "email.send.external", workspace: "test", target: "test@example.invalid", input: {}
  } });
  await workflow.decide({ requestId: "late", decision: {
    requestId: "late", policyId: "policy-v1", actionHash: record.binding.actionHash, state: "approved",
    approval: createApprovalGrant({ binding: record.binding, issuer: "test-authority",
      grantId: "late-grant", issuedAt: now().toISOString() })
  } });
  const original = workflow.resume("late");
  await providerAccepted;
  assert.equal((await workflow.reconcile("late")).status, "completed");
  release();
  assert.equal((await original).status, "completed");
  assert.equal(store.get("late").status, "completed");
  assert.equal(store.readReceipt("late").outcome, "provider_confirmed");
  assert.equal((await workflow.resume("late")).status, "completed");
  assert.equal(providerCalls, 1);
});
