import { buildApprovalPacket } from "./approval.js";
import { levelFromTier, summarizeEvidence, tierFromEvidence } from "./evidence.js";
import { AUTONOMY_LEVELS, DEFAULT_ACTION_POLICIES, policyForActionClass } from "./policies.js";

export { buildApprovalPacket } from "./approval.js";
export { emptyEvidenceSummary, levelFromTier, summarizeEvidence, tierFromEvidence } from "./evidence.js";
export { createLicenseToken, decodeLicenseToken, licenseAllows } from "./license.js";
export { AUTONOMY_LEVELS, DEFAULT_ACTION_POLICIES, inferExternalSideEffect, inferRiskClass, normalizeActionClass, policyForActionClass } from "./policies.js";

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
    const highRisk = policy.riskClass === "high" || policy.riskClass === "critical" || policy.externalSideEffects !== "none";

    if (highRisk && !explicitlyApproved) {
      return decision({
        allowed: false,
        needsApproval: true,
        mode: "approval_required",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "External, public, money, legal, or authority-changing actions require explicit human approval.",
        packet: buildApprovalPacket({
          workspace: this.workspace,
          actionClass,
          context,
          policy,
          evidence,
          reason: "Human approval required before this action can execute.",
          createdAt: this.now().toISOString()
        })
      });
    }

    if (highRisk && explicitlyApproved) {
      return decision({
        allowed: true,
        needsApproval: false,
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
        allowed: false,
        needsApproval: true,
        mode: "review_only",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "Negative evidence, trust issues, or high rejection rate require review before expanding autonomy.",
        packet: buildApprovalPacket({
          workspace: this.workspace,
          actionClass,
          context,
          policy,
          evidence,
          reason: "Review required because trust evidence regressed.",
          createdAt: this.now().toISOString()
        })
      });
    }

    if (policy.requiresApproval && !explicitlyApproved) {
      return decision({
        allowed: false,
        needsApproval: true,
        mode: "approval_required",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: "This action class requires approval by policy.",
        packet: buildApprovalPacket({
          workspace: this.workspace,
          actionClass,
          context,
          policy,
          evidence,
          reason: "Policy requires approval for this action class.",
          createdAt: this.now().toISOString()
        })
      });
    }

    if (autonomyLevel < policy.minimumLevel) {
      return decision({
        allowed: false,
        needsApproval: true,
        mode: "insufficient_evidence",
        autonomyLevel,
        tier,
        policy,
        evidence,
        reason: `Action requires autonomy level ${policy.minimumLevel}; current evidence supports level ${autonomyLevel}.`,
        packet: buildApprovalPacket({
          workspace: this.workspace,
          actionClass,
          context,
          policy,
          evidence,
          reason: "More evidence is needed before this action class can run without review.",
          createdAt: this.now().toISOString()
        })
      });
    }

    return decision({
      allowed: true,
      needsApproval: false,
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

export function canExecute(input = {}, options = {}) {
  return new TrustGraduation(options).canExecute(input);
}
