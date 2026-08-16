import crypto from "node:crypto";

import { normalizeActionClass } from "./policies.js";

/**
 * Deterministic JSON used for action commitments.
 *
 * This is the same deliberately small JCS-compatible subset used by the
 * Mission Gate conformance package: object keys are sorted, array order is
 * preserved, undefined object values are omitted, and non-finite numbers are
 * rejected. Changing these rules requires a new binding version.
 */
export function canonicalJson(value) {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical_json_non_finite_number");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry === undefined ? null : entry)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error(`canonical_json_unsupported_type:${typeof value}`);
}

export function digestObject(value) {
  return `sha256:${crypto.createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex")}`;
}

/** Bind one proposed effect to immutable, reviewable fields. */
export function bindAction({
  actionClass,
  workspace = "",
  principal = "",
  requestedBy = "agent",
  tenant = "",
  target = "",
  input = {},
  constraints = {},
  expiresAt = "",
  nonce = ""
} = {}) {
  if (!String(actionClass || "").trim()) throw new Error("actionClass is required");
  if (!String(principal || workspace || "").trim()) throw new Error("principal or workspace is required");

  const binding = {
    protocol: "trust-graduation-action-binding",
    version: "1.0",
    actionClass: normalizeActionClass(actionClass),
    workspace: String(workspace || ""),
    principal: String(principal || workspace),
    requestedBy: String(requestedBy || "agent"),
    tenant: String(tenant || ""),
    target: String(target || ""),
    inputHash: digestObject(input ?? {}),
    constraints: constraints && typeof constraints === "object" ? constraints : {},
    ...(expiresAt ? { expiresAt: String(expiresAt) } : {}),
    ...(nonce ? { nonce: String(nonce) } : {})
  };

  return { ...binding, actionHash: digestObject(binding) };
}

/** Create a single-use authorization decision bound to one exact action. */
export function createApprovalGrant({
  binding,
  grantId,
  issuer,
  issuedAt = new Date().toISOString(),
  expiresAt = binding?.expiresAt || "",
  revocationHandle = ""
} = {}) {
  if (!binding?.actionHash) throw new Error("binding.actionHash is required");
  const { actionHash, ...unsignedBinding } = binding;
  if (binding.protocol !== "trust-graduation-action-binding" || binding.version !== "1.0") {
    throw new Error("binding protocol is invalid");
  }
  if (digestObject(unsignedBinding) !== actionHash) throw new Error("binding integrity check failed");
  if (!String(binding.nonce || "").trim()) throw new Error("binding.nonce is required");
  if (!String(binding.expiresAt || "").trim()) throw new Error("binding.expiresAt is required");
  if (!String(grantId || "").trim()) throw new Error("grantId is required");
  if (!String(issuer || "").trim()) throw new Error("issuer is required");
  if (!String(expiresAt || "").trim()) throw new Error("expiresAt is required");
  if (String(expiresAt) !== binding.expiresAt) throw new Error("expiresAt must match binding.expiresAt");

  return {
    protocol: "trust-graduation-authorization",
    version: "1.0",
    state: "approved",
    grantId: String(grantId),
    issuer: String(issuer),
    principal: binding.principal,
    requestedBy: binding.requestedBy,
    workspace: binding.workspace,
    tenant: binding.tenant,
    actionClass: binding.actionClass,
    target: binding.target,
    inputHash: binding.inputHash,
    actionHash: binding.actionHash,
    nonce: binding.nonce,
    scope: "once",
    maxExecutions: 1,
    executionCount: 0,
    issuedAt: String(issuedAt),
    expiresAt: String(expiresAt),
    revocable: true,
    ...(revocationHandle ? { revocationHandle: String(revocationHandle) } : {})
  };
}

/**
 * Validate a grant immediately before execution. The caller remains
 * responsible for atomically consuming the grant before invoking the tool.
 */
export function validateApprovalGrant({ binding, approval, now = new Date() } = {}) {
  if (!binding?.actionHash) return invalid("missing_action_binding");
  if (binding.protocol !== "trust-graduation-action-binding" || binding.version !== "1.0") return invalid("action_binding_protocol_invalid");
  const { actionHash, ...unsignedBinding } = binding;
  if (digestObject(unsignedBinding) !== actionHash) return invalid("action_binding_integrity_failed");
  if (!String(binding.nonce || "").trim()) return invalid("action_binding_nonce_missing");
  if (!String(binding.expiresAt || "").trim()) return invalid("action_binding_expiry_missing");
  if (!approval || approval.state !== "approved") return invalid("approval_not_approved");
  if (!approval.actionHash) return invalid("approval_missing_action_hash");
  if (approval.protocol !== "trust-graduation-authorization" || approval.version !== "1.0") return invalid("approval_protocol_invalid");
  if (approval.actionHash !== binding.actionHash) return invalid("action_hash_mismatch");
  if (approval.inputHash !== binding.inputHash) return invalid("input_hash_mismatch");
  if (approval.actionClass !== binding.actionClass) return invalid("action_class_mismatch");
  if (String(approval.principal || "") !== String(binding.principal || "")) return invalid("principal_mismatch");
  if (String(approval.requestedBy || "") !== String(binding.requestedBy || "")) return invalid("requesting_agent_mismatch");
  if (String(approval.workspace || "") !== String(binding.workspace || "")) return invalid("workspace_mismatch");
  if (String(approval.tenant || "") !== String(binding.tenant || "")) return invalid("tenant_mismatch");
  if (String(approval.target || "") !== String(binding.target || "")) return invalid("target_mismatch");
  if (String(approval.nonce || "") !== String(binding.nonce || "")) return invalid("nonce_mismatch");
  if (!String(approval.grantId || "").trim() || !String(approval.issuer || "").trim()) return invalid("grant_identity_missing");
  if (approval.scope !== "once" || approval.maxExecutions !== 1) return invalid("grant_not_single_use");
  if (!Number.isInteger(approval.executionCount) || approval.executionCount < 0) return invalid("grant_execution_count_invalid");
  if (approval.executionCount >= approval.maxExecutions) return invalid("grant_already_consumed");
  if (approval.revocable !== true) return invalid("grant_not_revocable");
  if (approval.revokedAt) return invalid("grant_revoked");
  if (!approval.expiresAt) return invalid("grant_missing_expiry");
  if (binding.expiresAt && approval.expiresAt !== binding.expiresAt) return invalid("grant_expiry_mismatch");

  const checkedAt = now instanceof Date ? now : new Date(now);
  const issuedAt = new Date(approval.issuedAt);
  const expiresAt = new Date(approval.expiresAt);
  if (!Number.isFinite(checkedAt.getTime()) || !Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) return invalid("invalid_grant_time");
  if (issuedAt.getTime() > checkedAt.getTime()) return invalid("grant_not_yet_valid");
  if (expiresAt.getTime() <= checkedAt.getTime()) return invalid("grant_expired");

  return { ok: true, reason: "eligible_exact_action_pending_atomic_consumption", binding, approval };
}

/**
 * Process-local reference store for demos and tests.
 *
 * Production stores must implement the same consume contract with one atomic
 * compare-and-set operation shared by every executor. It must reject revoked
 * or existing grant identities in the same transaction; storage failures must
 * throw rather than return success.
 */
export function createMemoryGrantStore() {
  const consumed = new Set();
  const revoked = new Set();
  return Object.freeze({
    async consume(identity) {
      const key = grantStoreKey(identity);
      if (revoked.has(key)) return { ok: false, reason: "grant_revoked" };
      if (consumed.has(key)) return { ok: false, reason: "grant_already_consumed" };
      consumed.add(key);
      return { ok: true };
    },
    async revoke(identity) {
      revoked.add(grantStoreKey(identity));
      return true;
    }
  });
}

/**
 * Validate and atomically consume a grant immediately before provider use.
 * This is the execution-authority boundary; validation alone is not authority.
 */
export async function consumeApprovalGrant({ binding, approval, now = new Date(), store } = {}) {
  const validation = validateApprovalGrant({ binding, approval, now });
  if (!validation.ok) return validation;
  if (!store || typeof store.consume !== "function") return invalid("atomic_grant_store_required");

  let consumed;
  try {
    consumed = await store.consume(Object.freeze({
      grantId: approval.grantId,
      issuer: approval.issuer,
      tenant: approval.tenant,
      workspace: approval.workspace,
      principal: approval.principal,
      actionHash: approval.actionHash,
      expiresAt: approval.expiresAt,
      revocationHandle: approval.revocationHandle || ""
    }));
  } catch {
    return invalid("grant_store_unavailable");
  }
  if (consumed !== true && consumed?.ok !== true) {
    const reason = consumed?.reason;
    return invalid(reason === "grant_revoked" ? reason : "grant_already_consumed");
  }

  return {
    ok: true,
    reason: "authorized_and_consumed_exact_action_once",
    binding,
    approval: { ...approval, executionCount: 1 },
    consumedAt: (now instanceof Date ? now : new Date(now)).toISOString()
  };
}

function grantStoreKey({ grantId, issuer, tenant } = {}) {
  return digestObject({
    grantId: String(grantId || ""),
    issuer: String(issuer || ""),
    tenant: String(tenant || "")
  });
}

function invalid(reason) {
  return { ok: false, reason };
}
