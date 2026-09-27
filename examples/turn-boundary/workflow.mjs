// Reference orchestration around the public provider gate; not an agent tool
// for approving itself. Decision authentication and provider lookup belong to
// the trusted application and must be independent of model-authored claims.
import crypto from "node:crypto";
import { canonicalJson, createProviderGate, digestObject, validateApprovalGrant } from "../../src/index.js";

export function createTurnWorkflow({ store, authenticateDecision, provider, lookupProviderEvidence, now = () => new Date() }) {
  for (const name of ["get", "create", "compareAndSet", "consume", "readReceipt", "writeReceipt"]) {
    if (typeof store?.[name] !== "function") throw new Error(`store.${name} is required`);
  }
  for (const [name, fn] of Object.entries({ authenticateDecision, provider, lookupProviderEvidence, now })) {
    if (typeof fn !== "function") throw new Error(`${name} is required`);
  }
  const stamp = () => new Date(now()).toISOString();
  const snapshot = value => JSON.parse(canonicalJson(value));

  function get(requestId) {
    const record = store.get(requestId);
    if (!record) throw new Error("request_not_found");
    return record;
  }

  function update(requestId, change) {
    for (let attempt = 0; attempt < 32; attempt++) {
      const current = get(requestId);
      const next = change(current);
      if (!next) return current;
      if (store.compareAndSet(requestId, current.revision, { ...next, updatedAt: stamp() })) return get(requestId);
    }
    throw new Error("request_store_contention");
  }

  function failure(requestId, reason, status, expectedRevision) {
    return update(requestId, current => {
      if (expectedRevision !== undefined && current.revision !== expectedRevision) return null;
      return {
        ...current,
        ...(status ? { status, reconciliationRequired: status === "outcome_unknown" } : {}),
        failed: current.failed.some(entry => entry.reason === reason) ? current.failed : [
          ...current.failed, { requestId, reason, status: status || "approval_failed", at: stamp() }
        ]
      };
    });
  }

  async function authenticated(decision, record) {
    try {
      return await authenticateDecision(snapshot(decision), snapshot(record)) === true;
    } catch { return false; }
  }

  function gate(record) {
    return createProviderGate({
      store,
      now,
      authenticateGrant: async ({ approval }) => Boolean(record?.decision)
        && digestObject(approval) === digestObject(record.decision.approval)
        && await authenticated(record.decision, record),
      provider: (input, context) => provider(input, { ...context, requestId: record.requestId }),
      writeReceipt: receipt => store.writeReceipt(record.requestId, receipt)
    });
  }

  function request({ requestId, policyId, action }) {
    if (typeof policyId !== "string" || !policyId.trim()) throw new Error("policy_id_required");
    const proposed = { ...action, constraints: { ...action?.constraints, policyId } };
    // prepare validates canonical inputs before we persist a private snapshot.
    const binding = gate(null).prepare(proposed);
    const requestHash = digestObject({ action, policyId });
    const existing = store.get(requestId);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("request_id_conflict");
      return existing;
    }
    const record = {
      requestId, requestHash, policyId, binding,
      action: snapshot({ ...proposed, nonce: binding.nonce, expiresAt: binding.expiresAt }),
      status: "pending_approval", decision: null, failed: [],
      reconciliationRequired: false, createdAt: stamp(), updatedAt: stamp()
    };
    store.create(requestId, record);
    const persisted = get(requestId);
    if (persisted.requestHash !== requestHash) throw new Error("request_id_conflict");
    return persisted;
  }

  async function decide({ requestId, decision }) {
    const record = get(requestId);
    const savedDecision = snapshot(decision);
    if (!savedDecision || !["approved", "denied"].includes(savedDecision.state)
      || savedDecision.requestId !== requestId || savedDecision.actionHash !== record.binding.actionHash
      || savedDecision.policyId !== record.policyId) return failure(requestId, "decision_binding_mismatch");
    if (!await authenticated(savedDecision, record)) return failure(requestId, "decision_not_authenticated");
    if (record.decision) {
      if (digestObject(record.decision) !== digestObject(savedDecision)) throw new Error("decision_already_committed");
      return get(requestId);
    }
    if (savedDecision.state === "approved") {
      const validation = validateApprovalGrant({ binding: record.binding, approval: savedDecision.approval, now: now() });
      if (!validation.ok) return failure(requestId, validation.reason);
    }
    return update(requestId, current => {
      if (current.status !== "pending_approval") {
        if (digestObject(current.decision) !== digestObject(savedDecision)) throw new Error("decision_already_committed");
        return null;
      }
      return {
        ...current, decision: savedDecision, status: savedDecision.state,
        failed: savedDecision.state === "denied" ? [
          ...current.failed, { requestId, reason: "human_denied", status: "denied", at: stamp() }
        ] : current.failed
      };
    });
  }

  async function reconcile(requestId) {
    const record = get(requestId);
    if (!["executing", "outcome_unknown", "completed"].includes(record.status)) return record;
    // A lookup started against an older revision must not replace a newer
    // verified outcome with stale negative evidence.
    const unknown = reason => failure(requestId, reason, "outcome_unknown", record.revision);
    if (!await authenticated(record.decision, record)) return unknown("decision_not_authenticated");
    let observed;
    try { observed = await lookupProviderEvidence(snapshot(record)); } catch { /* explicit unknown below */ }
    if (!observed || observed.actionHash !== record.binding.actionHash || observed.inputHash !== record.binding.inputHash
      || !Object.hasOwn(observed, "result")) return unknown("provider_evidence_unavailable");
    let receipt;
    try {
      receipt = store.readReceipt(requestId);
      if (!receipt || receipt.outcome === "provider_outcome_unknown") {
        // Recovery after a lost provider reply, backed by the independent lookup.
        await store.writeReceipt(requestId, {
          protocol: "trust-graduation", version: "1.0", receiptId: crypto.randomUUID(),
          grantId: record.decision.approval.grantId, actionClass: record.binding.actionClass,
          actionHash: record.binding.actionHash, outcome: "provider_confirmed",
          externalActionExecuted: true, humanApproved: true,
          providerResultHash: digestObject(observed.result), createdAt: stamp(), reconciled: true
        });
      }
      // Completion always reads the separate artifact, including after restart.
      receipt = store.readReceipt(requestId);
      if (!receipt || receipt.actionHash !== record.binding.actionHash
        || receipt.grantId !== record.decision.approval.grantId
        || receipt.actionClass !== record.binding.actionClass
        || receipt.outcome !== "provider_confirmed" || receipt.externalActionExecuted !== true
        || receipt.providerResultHash !== digestObject(observed.result)) {
        return unknown("receipt_verification_failed");
      }
    } catch { return unknown("receipt_readback_unavailable"); }
    return update(requestId, current => ({
      ...current, status: "completed", reconciliationRequired: false, receiptId: receipt.receiptId
    }));
  }

  async function resume(requestId) {
    const record = get(requestId);
    if (["executing", "outcome_unknown", "completed"].includes(record.status)) return reconcile(requestId);
    if (record.status !== "approved") return record;
    // Commit intent before any provider I/O. A fresh process never retries a
    // claimed execution, even if it died between this claim and grant consume.
    if (!store.compareAndSet(requestId, record.revision, {
      ...record, status: "executing", reconciliationRequired: true, updatedAt: stamp()
    })) return get(requestId);
    const result = await gate(record).execute({ binding: record.binding, approval: record.decision.approval, action: record.action });
    if (!result.ok) {
      return failure(requestId, result.reason, result.providerCalled ? "outcome_unknown" : "failed");
    }
    return reconcile(requestId);
  }

  return Object.freeze({ request, decide, resume, reconcile, inspect: get });
}
