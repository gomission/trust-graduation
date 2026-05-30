export function buildApprovalPacket({
  workspace = "",
  actionClass = "",
  context = {},
  policy = {},
  evidence = {},
  reason = "",
  requestedBy = "agent",
  createdAt = new Date().toISOString()
} = {}) {
  return {
    protocol: "trust-graduation",
    version: "1.0",
    packetId: `tg_${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}_${slug(actionClass)}`,
    workspace,
    requestedBy,
    actionClass,
    riskClass: policy.riskClass || "medium",
    externalSideEffects: policy.externalSideEffects || "none",
    approvalRequired: true,
    receiptRequired: Boolean(policy.receiptRequired),
    reason,
    context,
    evidence,
    decisions: [
      { id: "approve_once", label: "Approve once", effect: "Allows this action only." },
      { id: "revise", label: "Revise", effect: "Keeps action blocked and returns changes to the agent." },
      { id: "reject", label: "Reject", effect: "Blocks action and records negative evidence." }
    ],
    createdAt
  };
}

function slug(value = "") {
  return String(value || "action")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "action";
}

