import { buildApprovalPacket } from "./approval.js";
import { levelFromTier, summarizeEvidence, tierFromEvidence } from "./evidence.js";
import { AUTONOMY_LEVELS, DEFAULT_ACTION_POLICIES, policyForActionClass } from "./policies.js";

export { buildApprovalPacket } from "./approval.js";
export { DECISION_WEIGHTS, PROVENANCE_WEIGHTS, decisionWeight, emptyEvidenceSummary, evidenceWeight, levelFromTier, provenanceWeight, summarizeEvidence, tierFromEvidence } from "./evidence.js";
export { createLicenseToken, decodeLicenseToken, licenseAllows } from "./license.js";
export { ACTION_CLASS_ALIASES, AUTONOMY_LEVELS, DEFAULT_ACTION_POLICIES, inferExternalSideEffect, inferRiskClass, normalizeActionClass, policyForActionClass } from "./policies.js";

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
    const explicitlyApproved = approval?.state === "approved" || context.approvalState === "approved";
    const highRisk = policy.riskClass === "high" || policy.riskClass === "critical";
    const createdAt = this.now().toISOString();
    const decisionId = `tgd_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}_${slug(actionClass)}`;
    const requestedAction = context.requestedAction && typeof context.requestedAction === "object"
      ? context.requestedAction
      : context;
    const constraints = context.constraints && typeof context.constraints === "object"
      ? context.constraints
      : policy.constraints && typeof policy.constraints === "object"
        ? policy.constraints
        : {};

    if (policy.actionClass === "payment.initiate" || policy.humanOnly) {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
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
        allowed: false,
        needsApproval: true,
        status: context.asynchronousApproval ? "deferred" : "review_required",
        mode: "approval_required",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "External, public, money, legal, or authority-changing actions require explicit human approval.",
        graduationPath: graduationPath({ policy, evidence, nextBestAction: "prepareApprovalPacket", safeFallbackActionClass: "draft.response" }),
        packet: buildApprovalPacket({
          decisionId,
          workspace: this.workspace,
          scope: typeof context.scope === "string" ? context.scope : "",
          principal: typeof context.principal === "string" ? context.principal : "",
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          context,
          policy,
          evidence,
          reason: "Human approval required before this action can execute.",
          requestedBy: typeof context.requestedBy === "string" ? context.requestedBy : "agent",
          createdAt,
          expiresAt: typeof context.expiresAt === "string" ? context.expiresAt : ""
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
        allowed: true,
        needsApproval: false,
        status: hasExecutionConstraints(constraints) ? "allowed_with_constraints" : "allowed",
        mode: "approved_once",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "Human approval permits this specific high-risk action once; the action class remains gated by default."
      });
    }

    if (tier === "review") {
      return decision({
        decisionId,
        createdAt,
        actionClass: policy.actionClass,
        requestedAction,
        constraints,
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
          principal: typeof context.principal === "string" ? context.principal : "",
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          context,
          policy,
          evidence,
          reason: "Review required because trust evidence regressed.",
          requestedBy: typeof context.requestedBy === "string" ? context.requestedBy : "agent",
          createdAt,
          expiresAt: typeof context.expiresAt === "string" ? context.expiresAt : ""
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
          principal: typeof context.principal === "string" ? context.principal : "",
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          context,
          policy,
          evidence,
          reason: "Policy requires approval for this action class.",
          requestedBy: typeof context.requestedBy === "string" ? context.requestedBy : "agent",
          createdAt,
          expiresAt: typeof context.expiresAt === "string" ? context.expiresAt : ""
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
          principal: typeof context.principal === "string" ? context.principal : "",
          actionClass: policy.actionClass,
          requestedAction,
          constraints,
          context,
          policy,
          evidence,
          reason: "More evidence is needed before this action class can run without review.",
          requestedBy: typeof context.requestedBy === "string" ? context.requestedBy : "agent",
          createdAt,
          expiresAt: typeof context.expiresAt === "string" ? context.expiresAt : ""
        })
      });
    }

    return decision({
      decisionId,
      createdAt,
      actionClass: policy.actionClass,
      requestedAction,
      constraints,
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
