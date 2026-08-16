import test from "node:test";
import assert from "node:assert/strict";

import {
  createApprovalGrant,
  createMemoryGrantStore,
  createProviderGate,
  runProviderGateConformance
} from "../src/index.js";

const now = new Date("2026-08-16T12:00:00.000Z");

function action(overrides = {}) {
  return {
    actionClass: "email.send.external",
    workspace: "workspace-1",
    principal: "principal-1",
    requestedBy: "mail-agent",
    tenant: "tenant-1",
    target: "buyer@example.com",
    input: { to: "buyer@example.com", subject: "Hello", body: "Exact body" },
    constraints: { scope: "once" },
    expiresAt: "2026-08-16T12:10:00.000Z",
    nonce: "nonce-1",
    ...overrides
  };
}

function dependencies(overrides = {}) {
  return {
    store: createMemoryGrantStore(),
    authenticateGrant: async () => true,
    provider: async (input) => ({ providerId: "provider-1", input }),
    writeReceipt: async () => ({ ok: true }),
    now: () => now,
    createId: () => "receipt-1",
    ...overrides
  };
}

function grant(binding, grantId = "grant-1") {
  return createApprovalGrant({
    binding,
    grantId,
    issuer: "principal:principal-1",
    issuedAt: now.toISOString()
  });
}

test("provider gate fails closed before provider use and emits a linked receipt after one exact consume", async () => {
  let providerCalls = 0;
  const receipts = [];
  const gate = createProviderGate(dependencies({
    provider: async (input) => {
      providerCalls += 1;
      return { providerId: `provider-${providerCalls}`, input };
    },
    writeReceipt: async (receipt) => receipts.push(receipt)
  }));
  const requested = action();
  const binding = gate.prepare(requested);
  const approval = grant(binding);

  const missing = await gate.execute({ binding, approval: null, action: requested });
  const mutation = await gate.execute({
    binding,
    approval,
    action: action({ input: { ...requested.input, body: "Mutated" } })
  });
  const valid = await gate.execute({ binding, approval, action: requested });
  const replay = await gate.execute({ binding, approval, action: requested });

  assert.equal(missing.providerCalled, false);
  assert.equal(mutation.reason, "action_hash_mismatch");
  assert.equal(valid.ok, true);
  assert.equal(valid.reason, "provider_confirmed");
  assert.equal(replay.reason, "grant_already_consumed");
  assert.equal(providerCalls, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].actionHash, binding.actionHash);
  assert.match(receipts[0].providerResultHash, /^sha256:[a-f0-9]{64}$/);
});

test("provider gate requires issuer authentication before atomic consumption", async () => {
  let providerCalls = 0;
  const gate = createProviderGate(dependencies({
    authenticateGrant: async () => ({ ok: false, reason: "issuer_signature_invalid" }),
    provider: async () => { providerCalls += 1; }
  }));
  const requested = action();
  const binding = gate.prepare(requested);
  const result = await gate.execute({ binding, approval: grant(binding), action: requested });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "issuer_signature_invalid");
  assert.equal(result.providerCalled, false);
  assert.equal(providerCalls, 0);
});

test("provider errors become outcome-unknown receipts and cannot be replayed", async () => {
  const receipts = [];
  const gate = createProviderGate(dependencies({
    provider: async () => { throw new TypeError("network ended after request write"); },
    writeReceipt: async (receipt) => receipts.push(receipt)
  }));
  const requested = action();
  const binding = gate.prepare(requested);
  const approval = grant(binding);
  const result = await gate.execute({ binding, approval, action: requested });
  const replay = await gate.execute({ binding, approval, action: requested });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.providerCalled, true);
  assert.equal(result.outcomeUnknown, true);
  assert.equal(result.receipt.externalActionExecuted, null);
  assert.equal(result.receipt.providerErrorCode, "TypeError");
  assert.equal(receipts.length, 1);
  assert.equal(replay.reason, "grant_already_consumed");
  assert.equal(replay.providerCalled, false);
});

test("a receipt-store failure after provider confirmation is never reported as success", async () => {
  const gate = createProviderGate(dependencies({
    writeReceipt: async () => { throw new Error("receipt store unavailable"); }
  }));
  const requested = action();
  const binding = gate.prepare(requested);
  const result = await gate.execute({ binding, approval: grant(binding), action: requested });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "receipt_store_unavailable_after_provider");
  assert.equal(result.providerCalled, true);
  assert.equal(result.outcomeUnknown, false);
});

test("reference provider adapter passes the complete machine-readable conformance contract", async () => {
  const result = await runProviderGateConformance({
    createGate: async (input) => createProviderGate(input)
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.provider_calls, {
    after_no_approval: 0,
    after_mutation: 0,
    after_authentication_failure: 0,
    after_store_failure: 0,
    after_valid: 1,
    after_replay: 1,
    after_two_racing_consumers: 2
  });
  assert.equal(result.receipts_written, 2);
  assert.ok(Object.values(result.checks).every(Boolean));
});

test("provider gate refuses missing trust-boundary dependencies", () => {
  assert.throws(() => createProviderGate(), /store\.consume is required/);
  assert.throws(() => createProviderGate({ store: createMemoryGrantStore() }), /authenticateGrant is required/);
});
