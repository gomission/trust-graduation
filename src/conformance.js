import {
  createApprovalGrant,
  createMemoryGrantStore
} from "./action-binding.js";

const FIXED_NOW = new Date("2026-08-16T12:00:00.000Z");
const FIXED_EXPIRY = "2026-08-16T12:10:00.000Z";

/**
 * Exercise an adapter factory at the provider boundary.
 *
 * The factory receives instrumented dependencies. A conforming adapter must
 * route the supplied provider through its exact-action gate; bypassing it is
 * visible in the provider-call counters.
 */
export async function runProviderGateConformance({ createGate } = {}) {
  if (typeof createGate !== "function") throw new Error("adapter must export createGate(dependencies)");

  const providerCalls = [];
  const receipts = [];
  let idCounter = 0;
  const createId = () => `conformance-${++idCounter}`;
  const provider = async (input) => {
    const result = {
      providerCallId: `provider-call-${providerCalls.length + 1}`,
      acceptedInput: input
    };
    providerCalls.push({ input, result });
    return result;
  };
  const writeReceipt = async (receipt) => {
    receipts.push(receipt);
    return { ok: true };
  };
  const authenticateGrant = async ({ approval }) => ({
    ok: approval?.issuer === "principal:conformance-principal"
  });
  const dependencies = {
    provider,
    store: createMemoryGrantStore(),
    authenticateGrant,
    writeReceipt,
    now: () => FIXED_NOW,
    createId
  };
  const gate = await createGate(dependencies);
  assertGate(gate);

  const action = exactAction({ nonce: "conformance-main" });
  const binding = gate.prepare(action);
  const grant = exactGrant(binding, "grant-main");

  const noApproval = await gate.execute({ binding, approval: null, action });
  const afterNoApproval = providerCalls.length;

  const mutatedAction = {
    ...action,
    input: { ...action.input, body: "Changed after review" }
  };
  const mutation = await gate.execute({ binding, approval: grant, action: mutatedAction });
  const afterMutation = providerCalls.length;

  const unauthenticatedGate = await createGate({
    ...dependencies,
    store: createMemoryGrantStore(),
    authenticateGrant: async () => ({ ok: false, reason: "conformance_issuer_rejected" })
  });
  assertGate(unauthenticatedGate);
  const unauthenticatedBinding = unauthenticatedGate.prepare(exactAction({ nonce: "conformance-auth" }));
  const unauthenticated = await unauthenticatedGate.execute({
    binding: unauthenticatedBinding,
    approval: exactGrant(unauthenticatedBinding, "grant-auth"),
    action: exactAction({ nonce: "conformance-auth" })
  });
  const afterAuthenticationFailure = providerCalls.length;

  const unavailableStoreGate = await createGate({
    ...dependencies,
    store: { consume: async () => { throw new Error("store unavailable"); } }
  });
  assertGate(unavailableStoreGate);
  const unavailableStoreBinding = unavailableStoreGate.prepare(exactAction({ nonce: "conformance-store" }));
  const unavailableStore = await unavailableStoreGate.execute({
    binding: unavailableStoreBinding,
    approval: exactGrant(unavailableStoreBinding, "grant-store"),
    action: exactAction({ nonce: "conformance-store" })
  });
  const afterStoreFailure = providerCalls.length;

  const valid = await gate.execute({ binding, approval: grant, action });
  const afterValid = providerCalls.length;
  const replay = await gate.execute({ binding, approval: grant, action });
  const afterReplay = providerCalls.length;

  const raceAction = exactAction({ nonce: "conformance-race", target: "race@example.com" });
  const raceBinding = gate.prepare(raceAction);
  const raceGrant = exactGrant(raceBinding, "grant-race");
  const race = await Promise.all([
    gate.execute({ binding: raceBinding, approval: raceGrant, action: raceAction }),
    gate.execute({ binding: raceBinding, approval: raceGrant, action: raceAction })
  ]);
  const afterRace = providerCalls.length;

  const checks = {
    no_approval_held: noApproval.ok === false
      && noApproval.providerCalled === false
      && afterNoApproval === 0,
    mutation_held: mutation.ok === false
      && mutation.providerCalled === false
      && afterMutation === 0,
    issuer_authentication_required: unauthenticated.ok === false
      && unauthenticated.providerCalled === false
      && unauthenticated.reason === "conformance_issuer_rejected"
      && afterAuthenticationFailure === 0,
    atomic_store_required: unavailableStore.ok === false
      && unavailableStore.providerCalled === false
      && unavailableStore.reason === "grant_store_unavailable"
      && afterStoreFailure === 0,
    exact_action_executed_once: valid.ok === true
      && valid.providerCalled === true
      && afterValid === 1,
    replay_held: replay.ok === false
      && replay.providerCalled === false
      && replay.reason === "grant_already_consumed"
      && afterReplay === 1,
    racing_duplicate_held: race.filter((entry) => entry.ok).length === 1
      && race.filter((entry) => entry.reason === "grant_already_consumed").length === 1
      && afterRace === 2,
    result_receipts_linked: receipts.length === 2
      && receipts.every((receipt) => receipt.outcome === "provider_confirmed")
      && receipts.every((receipt) => /^sha256:[a-f0-9]{64}$/.test(receipt.providerResultHash || ""))
      && receipts.some((receipt) => receipt.actionHash === binding.actionHash)
      && receipts.some((receipt) => receipt.actionHash === raceBinding.actionHash)
  };

  return {
    protocol: "trust-graduation-provider-gate-conformance",
    version: "0.1",
    ok: Object.values(checks).every(Boolean),
    checks,
    provider_calls: {
      after_no_approval: afterNoApproval,
      after_mutation: afterMutation,
      after_authentication_failure: afterAuthenticationFailure,
      after_store_failure: afterStoreFailure,
      after_valid: afterValid,
      after_replay: afterReplay,
      after_two_racing_consumers: afterRace
    },
    receipts_written: receipts.length
  };
}

function exactAction({ nonce, target = "buyer@example.com" } = {}) {
  return {
    actionClass: "email.send.external",
    workspace: "conformance-workspace",
    principal: "conformance-principal",
    requestedBy: "conformance-agent",
    tenant: "conformance-tenant",
    target,
    input: {
      to: target,
      subject: "Exact conformance subject",
      body: "Exact conformance body"
    },
    constraints: { scope: "once", sandbox: true },
    expiresAt: FIXED_EXPIRY,
    nonce
  };
}

function exactGrant(binding, grantId) {
  return createApprovalGrant({
    binding,
    grantId,
    issuer: "principal:conformance-principal",
    issuedAt: FIXED_NOW.toISOString()
  });
}

function assertGate(gate) {
  if (!gate || typeof gate.prepare !== "function" || typeof gate.execute !== "function") {
    throw new Error("createGate must return { prepare(action), execute({ binding, approval, action }) }");
  }
}
