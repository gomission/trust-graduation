import crypto from "node:crypto";

import {
  bindAction,
  consumeApprovalGrant,
  digestObject,
  validateApprovalGrant
} from "./action-binding.js";

const DEFAULT_GRANT_LIFETIME_MS = 10 * 60 * 1000;

/**
 * Build the smallest provider-bound Mission Gate integration.
 *
 * The caller supplies four trust-boundary dependencies explicitly:
 * issuer authentication, a shared atomic grant store, the provider function,
 * and a durable receipt sink. No callback is silently replaced with an
 * in-process production default.
 */
export function createProviderGate({
  store,
  authenticateGrant,
  provider,
  writeReceipt,
  now = () => new Date(),
  createId = () => crypto.randomUUID(),
  resultEvidence = (result) => result,
  grantLifetimeMs = DEFAULT_GRANT_LIFETIME_MS
} = {}) {
  requireFunction(store?.consume, "store.consume");
  requireFunction(authenticateGrant, "authenticateGrant");
  requireFunction(provider, "provider");
  requireFunction(writeReceipt, "writeReceipt");
  requireFunction(now, "now");
  requireFunction(createId, "createId");
  requireFunction(resultEvidence, "resultEvidence");
  if (!Number.isFinite(grantLifetimeMs) || grantLifetimeMs <= 0) {
    throw new Error("grantLifetimeMs must be a positive finite number");
  }

  function prepare(action = {}) {
    const checkedAt = asDate(now(), "now");
    return bindExecutionAction(action, {
      expiresAt: action.expiresAt || new Date(checkedAt.getTime() + grantLifetimeMs).toISOString(),
      nonce: action.nonce || String(createId())
    });
  }

  async function execute({ binding, approval, action } = {}) {
    const checkedAt = asDate(now(), "now");
    let actualBinding;
    try {
      actualBinding = bindExecutionAction(action, {
        expiresAt: binding?.expiresAt || "",
        nonce: binding?.nonce || ""
      });
    } catch (error) {
      return denied("actual_action_invalid", { detail: safeErrorCode(error) });
    }

    const structural = validateApprovalGrant({
      binding: actualBinding,
      approval,
      now: checkedAt
    });
    if (!structural.ok) return denied(structural.reason, { binding: actualBinding });

    let issuerAuthentication;
    try {
      issuerAuthentication = await authenticateGrant(Object.freeze({
        approval,
        binding: actualBinding,
        action: freezeAction(action)
      }));
    } catch {
      return denied("grant_issuer_authentication_unavailable", { binding: actualBinding });
    }
    if (issuerAuthentication !== true && issuerAuthentication?.ok !== true) {
      return denied(
        typeof issuerAuthentication?.reason === "string" && issuerAuthentication.reason
          ? issuerAuthentication.reason
          : "grant_issuer_not_authenticated",
        { binding: actualBinding }
      );
    }

    const authorization = await consumeApprovalGrant({
      binding: actualBinding,
      approval,
      now: checkedAt,
      store
    });
    if (!authorization.ok) {
      return denied(authorization.reason, { binding: actualBinding });
    }

    let providerResult;
    try {
      providerResult = await provider(action.input, Object.freeze({
        action: freezeAction(action),
        binding: actualBinding,
        approval,
        authorization
      }));
    } catch (error) {
      const receipt = createReceipt({
        id: createId,
        now,
        binding: actualBinding,
        approval,
        outcome: "provider_outcome_unknown",
        externalActionExecuted: null,
        providerErrorCode: safeErrorCode(error)
      });
      const receiptStored = await persistReceipt(writeReceipt, receipt);
      return {
        ok: false,
        reason: receiptStored
          ? "provider_outcome_unknown"
          : "provider_outcome_unknown_and_receipt_store_unavailable",
        providerCalled: true,
        outcomeUnknown: true,
        authorization,
        receipt
      };
    }

    let evidence;
    let providerResultHash;
    try {
      evidence = await resultEvidence(providerResult);
      providerResultHash = digestObject(evidence);
    } catch {
      const receipt = createReceipt({
        id: createId,
        now,
        binding: actualBinding,
        approval,
        outcome: "provider_confirmed_result_unlinked",
        externalActionExecuted: true
      });
      const receiptStored = await persistReceipt(writeReceipt, receipt);
      return {
        ok: false,
        reason: receiptStored
          ? "provider_result_evidence_invalid"
          : "provider_result_evidence_and_receipt_store_unavailable",
        providerCalled: true,
        outcomeUnknown: false,
        authorization,
        providerResult,
        receipt
      };
    }

    const receipt = createReceipt({
      id: createId,
      now,
      binding: actualBinding,
      approval,
      outcome: "provider_confirmed",
      externalActionExecuted: true,
      providerResultHash
    });
    if (!await persistReceipt(writeReceipt, receipt)) {
      return {
        ok: false,
        reason: "receipt_store_unavailable_after_provider",
        providerCalled: true,
        outcomeUnknown: false,
        authorization,
        providerResult,
        receipt
      };
    }

    return {
      ok: true,
      reason: "provider_confirmed",
      providerCalled: true,
      outcomeUnknown: false,
      binding: actualBinding,
      authorization,
      providerResult,
      receipt
    };
  }

  return Object.freeze({ prepare, execute });
}

function bindExecutionAction(action, { expiresAt, nonce } = {}) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("action must be an object");
  }
  if (!Object.prototype.hasOwnProperty.call(action, "input")) {
    throw new Error("action.input is required");
  }
  if (!Object.prototype.hasOwnProperty.call(action, "target")) {
    throw new Error("action.target is required");
  }

  return bindAction({
    actionClass: action.actionClass,
    workspace: action.workspace,
    principal: action.principal,
    requestedBy: action.requestedBy,
    tenant: action.tenant,
    target: action.target,
    input: action.input,
    constraints: action.constraints,
    expiresAt,
    nonce
  });
}

function createReceipt({
  id,
  now,
  binding,
  approval,
  outcome,
  externalActionExecuted,
  providerResultHash = "",
  providerErrorCode = ""
}) {
  return Object.freeze({
    protocol: "trust-graduation",
    version: "1.0",
    receiptId: String(id()),
    grantId: approval.grantId,
    actionClass: binding.actionClass,
    actionHash: binding.actionHash,
    outcome,
    externalActionExecuted,
    humanApproved: true,
    createdAt: asDate(now(), "now").toISOString(),
    ...(providerResultHash ? { providerResultHash } : {}),
    ...(providerErrorCode ? { providerErrorCode } : {})
  });
}

async function persistReceipt(writeReceipt, receipt) {
  try {
    const result = await writeReceipt(receipt);
    return result !== false && result?.ok !== false;
  } catch {
    return false;
  }
}

function denied(reason, extra = {}) {
  return {
    ok: false,
    reason,
    providerCalled: false,
    outcomeUnknown: false,
    ...extra
  };
}

function freezeAction(action = {}) {
  return Object.freeze({ ...action });
}

function asDate(value, name) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} must return a valid date`);
  return date;
}

function safeErrorCode(error) {
  const name = typeof error?.name === "string" && error.name ? error.name : "Error";
  return name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80);
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new Error(`${name} is required`);
}
