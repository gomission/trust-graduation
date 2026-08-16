import crypto from "node:crypto";

import { buildApprovalPacket } from "./approval.js";
import { bindAction, validateApprovalGrant } from "./action-binding.js";
import { levelFromTier, summarizeEvidence, tierFromEvidence } from "./evidence.js";
import { AUTONOMY_LEVELS, DEFAULT_ACTION_POLICIES, policyForActionClass } from "./policies.js";

export { buildApprovalPacket } from "./approval.js";
export { bindAction, canonicalJson, consumeApprovalGrant, createApprovalGrant, createMemoryGrantStore, digestObject, validateApprovalGrant } from "./action-binding.js";
export { A2A_AUTHORIZATION_EXTENSION_URI, A2A_AUTHORIZATION_MEDIA_TYPE, A2A_RECEIPT_MEDIA_TYPE, a2aAgentExtension, toA2AApprovalMessage, toA2AAuthorizationTask, toA2AReceiptArtifact } from "./a2a.js";
export { runProviderGateConformance } from "./conformance.js";
export { DECISION_WEIGHTS, PROVENANCE_WEIGHTS, decisionWeight, emptyEvidenceSummary, evidenceWeight, levelFromTier, provenanceWeight, summarizeEvidence, tierFromEvidence } from "./evidence.js";
export { createLicenseToken, decodeLicenseToken, licenseAllows } from "./license.js";
export { ACTION_CLASS_ALIASES, AUTONOMY_LEVELS, DEFAULT_ACTION_POLICIES, inferExternalSideEffect, inferRiskClass, normalizeActionClass, policyForActionClass } from "./policies.js";
export { createProviderGate } from "./provider-gate.js";

export class TrustGraduation {
  constructor({ workspace = "", evidence = [], policies = DEFAULT_ACTION_POLICIES, now = () => new Date() } = {}) {
    this.workspace = workspace;
    this.evidence = evidence;
    this.policies = policies;
    this.now = now;
  }

  canExecute({ actionClass, context = {}, approval = null } = {}) {
    if (!actionClass) throw new Error("actionClass is required");
    const policy = policyForActionClass(actionClass, this.policies);
    const evidence = summarizeEvidence(this.evidence, actionClass);
    const tier = tierFromEvidence(evidence);
    const autonomyLevel = levelFromTier(tier);
    const highRisk = policy.riskClass === "high" || policy.riskClass === "critical";
    const currentTime = this.now();
    const createdAt = currentTime.toISOString();
    const decisionId = `tgd_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}_${slug(actionClass)}`;
    const requestedAction = context.requestedAction && typeof context.requestedAction === "object"
      ? context.requestedAction
      : context;
    const constraints = context.constraints && typeof context.constraints === "object"
      ? context.constraints
      : policy.constraints && typeof policy.constraints === "object"
        ? policy.constraints
        : {};
    const approvalPresented = approval?.state === "approved" || context.approvalState === "approved";
    const actionBinding = bindAction({
      actionClass: policy.actionClass,
      workspace: this.workspace,
      principal: typeof context.principal === "string" ? context.principal : this.workspace,
      requestedBy: typeof context.requestedBy === "string" ? context.requestedBy : "agent",
      tenant: typeof context.tenant === "string" ? context.tenant : "",
      target: typeof context.target === "string"
        ? context.target
        : typeof context.recipient === "string"
          ? context.recipient
          : "",
      input: Object.prototype.hasOwnProperty.call(context, "input") ? context.input : requestedAction,
      constraints,
      expiresAt: typeof context.expiresAt === "string" && context.expiresAt.trim()
        ? context.expiresAt
        : typeof constraints.expires_at === "string" && constraints.expires_at.trim()
          ? constraints.expires_at
          : approvalPresented && typeof approval?.expiresAt === "string" && approval.expiresAt.trim()
            ? approval.expiresAt
            : new Date(currentTime.getTime() + 10 * 60 * 1000).toISOString(),
      nonce: typeof context.nonce === "string" && context.nonce.trim()
        ? context.nonce
        : approvalPresented && typeof approval?.nonce === "string" && approval.nonce.trim()
          ? approval.nonce
          : crypto.randomUUID()
    });
    const approvalValidation = approvalPresented
      ? validateApprovalGrant({ binding: actionBinding, approval, now: currentTime })
      : { ok: false, reason: "approval_not_presented" };
    const explicitlyApproved = approvalValidation.ok;

    if (policy.actionClass === "payment.initiate" || policy.humanOnly) {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
        actionBinding,
        allowed: false,
        needsApproval: true,
        status: "human_only",
        mode: "human_only",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "Human-only action class. The agent may prepare rationale, but only the principal may execute.",
        graduationPath: graduationPath({ policy, evidence, nextBestAction: "stop", safeFallbackActionClass: "draft.compose" })
      });
    }

    if (highRisk && !explicitlyApproved) {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
        actionBinding,
        allowed: false,
        needsApproval: true,
        status: context.asynchronousApproval ? "deferred" : "review_required",
        mode: "approval_required",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: approvalPresented
          ? `Presented approval does not authorize this exact action: ${approvalValidation.reason}.`
          : "External, public, money, legal, or authority-changing actions require explicit human approval.",
        graduationPath: graduationPath({ policy, evidence, nextBestAction: "prepareApprovalPacket", safeFallbackActionClass: "draft.response" }),
        packet: buildApprovalPacket({
          decisionId,
          workspace: this.workspace,
          scope: typeof context.scope === "string" ? context.scope : "",
          principal: actionBinding.principal,
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          actionBinding,
          context,
          policy,
          evidence,
          reason: "Human approval required before this action can execute.",
          requestedBy: actionBinding.requestedBy,
          createdAt,
          expiresAt: actionBinding.expiresAt || ""
        })
      });
    }

    if (highRisk && explicitlyApproved) {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
        actionBinding,
        allowed: false,
        needsApproval: false,
        status: "deferred",
        mode: "pending_atomic_consumption",
        autonomyLevel,
        tier,
        policy,
        evidence,
        requiresAtomicConsumption: true,
        reason: "The grant matches this exact action. The executor must atomically consume it before the provider call; validation alone is not execution authority."
      });
    }

    if (tier === "review") {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
        actionBinding,
        allowed: false,
        needsApproval: true,
        status: context.asynchronousApproval ? "deferred" : "review_required",
        mode: "review_only",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "Negative evidence, trust issues, or high rejection rate require review before expanding autonomy.",
        graduationPath: graduationPath({ policy, evidence, nextBestAction: "request_principal_approval", safeFallbackActionClass: "draft.response" }),
        packet: buildApprovalPacket({
          decisionId,
          workspace: this.workspace,
          scope: typeof context.scope === "string" ? context.scope : "",
          principal: actionBinding.principal,
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          actionBinding,
          context,
          policy,
          evidence,
          reason: "Review required because trust evidence regressed.",
          requestedBy: actionBinding.requestedBy,
          createdAt,
          expiresAt: actionBinding.expiresAt || ""
        })
      });
    }

    if (policy.requiresApproval && !explicitlyApproved) {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
        actionBinding,
        allowed: false,
        needsApproval: true,
        status: context.asynchronousApproval ? "deferred" : "review_required",
        mode: "approval_required",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "This action class requires approval by policy.",
        graduationPath: graduationPath({ policy, evidence, nextBestAction: "prepareApprovalPacket", safeFallbackActionClass: "draft.response" }),
        packet: buildApprovalPacket({
          decisionId,
          workspace: this.workspace,
          scope: typeof context.scope === "string" ? context.scope : "",
          principal: actionBinding.principal,
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          actionBinding,
          context,
          policy,
          evidence,
          reason: "Policy requires approval for this action class.",
          requestedBy: actionBinding.requestedBy,
          createdAt,
          expiresAt: actionBinding.expiresAt || ""
        })
      });
    }

    if (autonomyLevel < policy.minimumLevel) {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
        actionBinding,
        allowed: false,
        needsApproval: true,
        status: "review_required",
        mode: "insufficient_evidence",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: `Action requires autonomy level ${policy.minimumLevel}; current evidence supports level ${autonomyLevel}.`,
        graduationPath: graduationPath({ policy, evidence, nextBestAction: "collect_receipt", safeFallbackActionClass: fallbackActionClass(policy.actionClass) }),
        packet: buildApprovalPacket({
          decisionId,
          workspace: this.workspace,
          scope: typeof context.scope === "string" ? context.scope : "",
          principal: actionBinding.principal,
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          actionBinding,
          context,
          policy,
          evidence,
          reason: "More evidence is needed before this action class can run without review.",
          requestedBy: actionBinding.requestedBy,
          createdAt,
          expiresAt: actionBinding.expiresAt || ""
        })
      });
    }

    return decision({
      decisionId,
      createdAt,
      actionClass: policy.actionClass,
      requestedAction,
      constraints,
      actionBinding,
      allowed: true,
      needsApproval: false,
      status: hasExecutionConstraints(constraints) ? "allowed_with_constraints" : "allowed",
      mode: tier === "auto_capped" ? "auto_capped" : tier === "supervised" ? "supervised" : "allowed",
      autonomyLevel,
      tier,
      policy,
      evidence,
      reason: "Action is inside the current trust boundary."
    });
  }
}

function decision(fields) {
  return {
    protocol: "trust-graduation",
    version: "1.0",
    ...fields
  };
}

function slug(value = "") {
  return String(value || "action")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "action";
}

function hasExecutionConstraints(constraints = {}) {
  const keys = Object.keys(constraints || {});
  return keys.some((key) => [
    "internal_only",
    "staging_only",
    "dry_run_only",
    "max_amount",
    "rate_limit",
    "recipient_allowlist",
    "domain_allowlist",
    "expires_at",
    "requires_witness",
    "redaction_rules"
  ].includes(key));
}

function graduationPath({ policy = {}, evidence = {}, nextBestAction = "prepareApprovalPacket", safeFallbackActionClass = "draft.compose" } = {}) {
  const needed = Math.max(Number(policy.minimumLevel || 0), 0);
  const current = Math.max(levelFromTier(evidence.tier || tierFromEvidence(evidence || {})), 0);
  return {
    needed,
    current,
    next_best_action: nextBestAction,
    safe_fallback_action_class: safeFallbackActionClass,
    required_evidence: policy.requiresApproval
      ? ["principal approval receipt", "successful execution receipt for the same action_class"]
      : ["approval or correction receipt for the same action_class"]
  };
}

function fallbackActionClass(actionClass = "") {
  if (/email|message|reply|response/i.test(actionClass)) return "draft.response";
  if (/calendar|proposal|post|payment/i.test(actionClass)) return "draft.compose";
  return "tool.call.local";
}

export function canExecute(input = {}, options = {}) {
  return new TrustGraduation(options).canExecute(input);
}
