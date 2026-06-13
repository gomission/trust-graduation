export const AUTONOMY_LEVELS = [
  { level: 0, name: "observe", description: "Read, summarize, flag, and explain. No writes." },
  { level: 1, name: "prepare", description: "Draft, rank, route, and assemble review packets." },
  { level: 2, name: "stage", description: "Pre-fill local packets or commands for final review." },
  { level: 3, name: "execute_narrow", description: "Execute bounded low-risk actions with receipts." },
  { level: 4, name: "delegate", description: "Run bounded workflows inside a defined domain." },
  { level: 5, name: "govern", description: "Recommend policy, autonomy, or roster changes." }
];

export const DEFAULT_ACTION_POLICIES = [
  {
    actionClass: "read.context",
    lane: "observe",
    riskClass: "low",
    minimumLevel: 0,
    requiresApproval: false,
    receiptRequired: false,
    externalSideEffects: "none",
    description: "Read, search, inspect, summarize, or rank context."
  },
  {
    actionClass: "draft.compose",
    lane: "prepare",
    riskClass: "low",
    minimumLevel: 1,
    requiresApproval: false,
    receiptRequired: false,
    externalSideEffects: "none",
    description: "Compose a new local draft."
  },
  {
    actionClass: "draft.response",
    lane: "prepare",
    riskClass: "medium",
    minimumLevel: 1,
    requiresApproval: false,
    receiptRequired: false,
    externalSideEffects: "none",
    description: "Draft private text for human review."
  },
  {
    actionClass: "tool.call.local",
    lane: "stage",
    riskClass: "low",
    minimumLevel: 1,
    requiresApproval: false,
    receiptRequired: false,
    externalSideEffects: "none",
    description: "Call a local tool without external effect."
  },
  {
    actionClass: "email.send.internal",
    lane: "act",
    riskClass: "medium",
    minimumLevel: 3,
    requiresApproval: false,
    receiptRequired: true,
    externalSideEffects: "email_send",
    constraints: { domain_allowlist: [], rate_limit: { count: 5, window: "PT1H" } },
    description: "Send to an established internal or known recipient under explicit constraints."
  },
  {
    actionClass: "email.send.external",
    lane: "ask",
    riskClass: "high",
    minimumLevel: 5,
    requiresApproval: true,
    receiptRequired: true,
    externalSideEffects: "email_send",
    description: "Send an email or message outside the local workspace."
  },
  {
    actionClass: "social.post.public",
    lane: "ask",
    riskClass: "high",
    minimumLevel: 5,
    requiresApproval: true,
    receiptRequired: true,
    externalSideEffects: "public_post",
    description: "Publish to a public social surface."
  },
  {
    actionClass: "calendar.create",
    lane: "ask",
    riskClass: "high",
    minimumLevel: 5,
    requiresApproval: true,
    receiptRequired: true,
    externalSideEffects: "calendar_invite",
    description: "Create or change an external calendar invite."
  },
  {
    actionClass: "payment.initiate",
    lane: "ask",
    riskClass: "critical",
    minimumLevel: 5,
    requiresApproval: true,
    receiptRequired: true,
    externalSideEffects: "money_movement",
    description: "Spend, move, or commit money."
  },
  {
    actionClass: "proposal.submit",
    lane: "ask",
    riskClass: "high",
    minimumLevel: 5,
    requiresApproval: true,
    receiptRequired: true,
    externalSideEffects: "external_write",
    description: "Submit a proposal, bid, application, or commitment for review."
  }
];

export const ACTION_CLASS_ALIASES = {
  "local.read": "read.context",
  "local.memory.write": "draft.compose",
  "email.draft.external": "draft.compose",
  "calendar.invite.external": "calendar.create",
  "calendar.create.external": "calendar.create",
  "social.post.external": "social.post.public",
  "payment.spend": "payment.initiate",
  relationship_followup_drafting: "draft.response",
  draft_response_drafting: "draft.response",
  referral_ask_drafting: "draft.compose",
  workspace_trust_boundary: "draft.response",
  "relationship.followup.drafting": "draft.response",
  "draft.response.drafting": "draft.response",
  "referral.ask.drafting": "draft.compose",
  "workspace.trust.boundary": "draft.response"
};

export function normalizeActionClass(actionClass = "") {
  const raw = String(actionClass || "").trim().toLowerCase();
  const normalized = raw.replaceAll("_", ".");
  return ACTION_CLASS_ALIASES[raw] || ACTION_CLASS_ALIASES[normalized] || normalized;
}

export function policyForActionClass(actionClass, policies = DEFAULT_ACTION_POLICIES) {
  const normalized = normalizeActionClass(actionClass);
  return policies.find((policy) => normalizeActionClass(policy.actionClass) === normalized) || {
    actionClass: actionClass || "unknown",
    lane: "ask",
    riskClass: inferRiskClass(actionClass),
    minimumLevel: 1,
    requiresApproval: inferRiskClass(actionClass) !== "low",
    receiptRequired: inferRiskClass(actionClass) !== "low",
    externalSideEffects: inferExternalSideEffect(actionClass),
    description: "Unknown action class. Default to conservative gating."
  };
}

export function inferRiskClass(actionClass = "") {
  const value = normalizeActionClass(actionClass);
  if (/payment|spend|legal|contract|policy|permission|authority|delete|irreversible/.test(value)) return "critical";
  if (/send|external|post|publish|submit|invite|dm|comment|public/.test(value)) return "high";
  if (/draft|stage|preview|recommend|rank|route|local/.test(value)) return "medium";
  if (/read|observe|summarize|score/.test(value)) return "low";
  return "medium";
}

export function inferExternalSideEffect(actionClass = "") {
  const value = normalizeActionClass(actionClass);
  if (/email.*send|send.*email|message|dm/.test(value)) return "email_send";
  if (/post|publish|comment|social|public/.test(value)) return "public_post";
  if (/calendar|invite|meeting/.test(value)) return "calendar_invite";
  if (/payment|spend|transaction/.test(value)) return "money_movement";
  if (/external|submit/.test(value)) return "external_write";
  return "none";
}
