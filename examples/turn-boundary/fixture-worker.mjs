// Synthetic provider and signing authority for the crash tests. This sends no
// email. Production adapters must supply their own authenticated approval host
// and provider-owned lookup; these local fixtures do not authenticate a human.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { canonicalJson, createApprovalGrant, digestObject } from "../../src/index.js";
import { createFileTurnStore } from "./file-store.mjs";
import { createTurnWorkflow } from "./workflow.mjs";

const [root, command, mode = "normal", adapterPath] = process.argv.slice(2);
if (!root || !command) throw new Error("usage: fixture-worker.mjs WORKSPACE request|approve|deny|resume [MODE]");
const requestId = "message-1";
const fixedNow = new Date(mode === "expired" ? "2026-09-27T12:11:00Z" : "2026-09-27T12:00:00Z");
const signingKey = "synthetic-test-authority-only-not-a-production-credential";
const sign = decision => crypto.createHmac("sha256", signingKey).update(canonicalJson(decision)).digest("hex");
const checkpoint = async name => {
  process.send?.({ checkpoint: name });
  setInterval(() => {}, 1000);
  await new Promise(() => {});
};
const backing = createFileTurnStore(path.join(root, "host"));
const store = {
  ...backing,
  async writeReceipt(id, receipt) {
    if (mode === "receipt-store-offline") throw new Error("synthetic_receipt_store_offline");
    if (mode === "receipt-store-lies") return true;
    backing.writeReceipt(id, receipt);
    if (mode === "pause-receipt_persisted") await checkpoint("receipt_persisted");
    return true;
  },
  consume: identity => {
    if (mode === "grant-store-offline") throw new Error("synthetic_grant_store_offline");
    return backing.consume(identity);
  }
};
const factory = adapterPath ? (await import(pathToFileURL(adapterPath).href)).createWorkflow : createTurnWorkflow;
if (typeof factory !== "function") throw new Error("adapter must export createWorkflow(dependencies)");
const workflow = await factory({
  store, now: () => fixedNow,
  authenticateDecision: async decision => {
    const { signature, ...body } = decision || {};
    return signature === sign(body);
  },
  provider: async (input, { binding }) => {
    if (mode === "pause-before-provider") await checkpoint("before_provider");
    if (mode === "false-success") return { providerId: "invented", delivered: true };
    const provider = createFileTurnStore(path.join(root, "provider"));
    const dir = path.join(root, "provider", "calls");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, crypto.randomUUID()), JSON.stringify(input));
    const evidence = {
      actionHash: binding.actionHash, inputHash: digestObject(input),
      result: { providerId: `message-${binding.nonce}`, delivered: true }
    };
    if (!provider.create(binding.actionHash.slice(7), evidence)) throw new Error("duplicate_provider_call");
    if (mode === "pause-provider_accepted") await checkpoint("provider_accepted");
    return evidence.result;
  },
  lookupProviderEvidence: async record => {
    const provider = createFileTurnStore(path.join(root, "provider"));
    return provider.get(record.binding.actionHash.slice(7));
  }
});
for (const method of ["request", "decide", "resume", "reconcile", "inspect"]) {
  if (typeof workflow?.[method] !== "function") throw new Error(`workflow.${method} is required`);
}

let result;
if (command === "request") {
  result = await workflow.request({
    requestId, policyId: mode === "changed-policy" ? "human-message-v2" : "human-message-v1",
    action: {
      actionClass: "email.send.external", workspace: "synthetic-workspace", principal: "fixture-human",
      requestedBy: "fixture-agent", target: "recipient@example.invalid",
      input: { to: "recipient@example.invalid", body: mode === "changed-input" ? "Changed body" : "Approved message" }
    }
  });
  if (mode === "pause-pending") await checkpoint("pending_persisted");
} else if (command === "approve" || command === "deny") {
  const record = await workflow.inspect(requestId);
  const decision = {
    requestId, actionHash: record.binding.actionHash, policyId: record.policyId,
    state: command === "approve" ? "approved" : "denied",
    ...(command === "approve" ? { approval: createApprovalGrant({
      binding: record.binding, grantId: "fixture-grant-1", issuer: "fixture-human-host", issuedAt: fixedNow.toISOString()
    }) } : {})
  };
  result = await workflow.decide({ requestId, decision: {
    ...decision, signature: mode === "forged-decision" ? "forged" : sign(decision)
  } });
  if (mode === "pause-decision") await checkpoint("decision_persisted");
} else if (command === "resume") {
  result = await workflow.resume(requestId);
} else throw new Error("unknown_command");

if (process.send) process.send({ result }, () => process.disconnect());
else process.stdout.write(JSON.stringify(result, null, 2) + "\n");
