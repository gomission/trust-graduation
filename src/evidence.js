export const POSITIVE_EVIDENCE_TYPES = new Set([
  "approved",
  "used",
  "sent_with_receipt",
  "edited_and_accepted",
  "outcome_advanced",
  "receipt_created",
  "manual_success"
]);

export const NEGATIVE_EVIDENCE_TYPES = new Set([
  "rejected",
  "overrode",
  "trust_issue",
  "rollback",
  "repair_required",
  "user_complaint",
  "hallucination"
]);

export const DECISION_WEIGHTS = {
  sent: 1,
  executed: 1,
  sent_with_receipt: 1,
  approved: 0.85,
  used: 0.85,
  edited_and_accepted: 0.35,
  minor_edit: 0.35,
  edited: -0.15,
  heavy_rewrite: -0.55,
  held: 0,
  rejected: -1,
  overrode: -1,
  rollback: -1,
  trust_issue: -1,
  hallucination: -1
};

export const PROVENANCE_WEIGHTS = {
  receipt: 1,
  principal: 1,
  connector: 0.3,
  model_inferred: 0.1
};

export function emptyEvidenceSummary(actionClass) {
  return {
    actionClass,
    evidenceSources: [],
    approvals: 0,
    edits: 0,
    rejections: 0,
    held: 0,
    receipts: 0,
    outcomes: 0,
    trustIssues: 0,
    rollbacks: 0,
    positive: 0,
    negative: 0,
    weightedPositive: 0,
    weightedNegative: 0,
    decisions: 0,
    avgEditDistance: 0,
    rejectionRate: 0
  };
}

function sourceOf(entry = {}) {
  return entry.source || entry.evidenceSource || entry.evidence_source || "ledger";
}

function actionClassOf(entry = {}) {
  return entry.actionClass || entry.action_class || entry.class || "";
}

function typeOf(entry = {}) {
  return String(entry.type || entry.eventType || entry.event_type || entry.decision || "").toLowerCase();
}

function provenanceTypeOf(entry = {}) {
  return String(entry.sourceType || entry.source_type || entry.provenanceType || entry.provenance_type || "").toLowerCase();
}

export function decisionWeight(entry = {}) {
  const explicit = entry.decisionWeight ?? entry.decision_weight;
  if (Number.isFinite(Number(explicit))) return Math.max(-1, Math.min(1, Number(explicit)));
  const type = typeOf(entry);
  if (Object.prototype.hasOwnProperty.call(DECISION_WEIGHTS, type)) return DECISION_WEIGHTS[type];
  if (/approve|sent|used|outcome|advanced|success|receipt/.test(type)) return 1;
  if (/edited|edit/.test(type)) return -0.15;
  if (/held|hold/.test(type)) return 0;
  if (/reject|overrode|override|rollback|trust_issue|complaint|hallucination|repair/.test(type)) return -1;
  return 0;
}

export function provenanceWeight(entry = {}) {
  const explicit = entry.provenanceWeight ?? entry.provenance_weight;
  if (Number.isFinite(Number(explicit))) return Math.max(0, Math.min(1, Number(explicit)));
  const sourceType = provenanceTypeOf(entry);
  if (Object.prototype.hasOwnProperty.call(PROVENANCE_WEIGHTS, sourceType)) return PROVENANCE_WEIGHTS[sourceType];
  return 1;
}

export function evidenceWeight(entry = {}) {
  const explicit = entry.evidenceWeight ?? entry.evidence_weight;
  if (Number.isFinite(Number(explicit))) return Math.max(-1, Math.min(1, Number(explicit)));
  return Number((decisionWeight(entry) * provenanceWeight(entry)).toFixed(4));
}

export function summarizeEvidence(evidence = [], actionClass = "") {
  if (!Array.isArray(evidence)) {
    return {
      ...emptyEvidenceSummary(actionClass),
      ...evidence,
      actionClass: evidence.actionClass || evidence.action_class || actionClass
    };
  }

  const summary = emptyEvidenceSummary(actionClass);
  const sources = new Set();
  for (const entry of evidence) {
    const entryClass = actionClassOf(entry);
    if (actionClass && entryClass && entryClass !== actionClass) continue;
    sources.add(sourceOf(entry));
    const type = typeOf(entry);
    const editDistance = Number(entry.editDistance ?? entry.edit_distance ?? 0);
    const weight = evidenceWeight(entry);
    if (editDistance > summary.avgEditDistance) summary.avgEditDistance = editDistance;
    if (weight > 0) summary.weightedPositive += weight;
    if (weight < 0) summary.weightedNegative += Math.abs(weight);

    if (/approve|approved|sent|used/.test(type)) {
      summary.approvals += 1;
      summary.positive += 1;
      summary.decisions += 1;
    } else if (/edited|edit/.test(type)) {
      summary.edits += 1;
      summary.positive += 1;
      summary.decisions += 1;
    } else if (/reject|rejected|overrode|override/.test(type)) {
      summary.rejections += 1;
      summary.negative += 1;
      summary.decisions += 1;
    } else if (/held|hold/.test(type)) {
      summary.held += 1;
      summary.decisions += 1;
    } else if (/trust_issue|complaint|hallucination/.test(type)) {
      summary.trustIssues += 1;
      summary.negative += 1;
    } else if (/rollback|repair/.test(type)) {
      summary.rollbacks += 1;
      summary.negative += 1;
    } else if (/receipt/.test(type)) {
      summary.receipts += 1;
      summary.positive += 1;
    } else if (/outcome|advanced|success/.test(type)) {
      summary.outcomes += 1;
      summary.positive += 1;
    } else if (POSITIVE_EVIDENCE_TYPES.has(type)) {
      summary.positive += 1;
    } else if (NEGATIVE_EVIDENCE_TYPES.has(type)) {
      summary.negative += 1;
    }
  }
  summary.evidenceSources = [...sources].sort();
  summary.rejectionRate = summary.positive + summary.negative
    ? Number((summary.negative / (summary.positive + summary.negative)).toFixed(3))
    : 0;
  return summary;
}

export function tierFromEvidence(summary = {}) {
  const positive = Number(summary.positive || 0);
  const negative = Number(summary.negative || 0);
  const approvals = Number(summary.approvals || 0);
  const trustIssues = Number(summary.trustIssues || summary.trust_issues || 0);
  const rejections = Number(summary.rejections || 0);
  const avgEditDistance = Number(summary.avgEditDistance ?? summary.avg_edit_distance ?? 0);
  const total = positive + negative;
  const rejectionRate = total ? negative / total : 0;

  if (trustIssues > 0 || rejections >= 3 || rejectionRate >= 0.34) return "review";
  if (positive >= 10 && approvals >= 6 && negative === 0 && avgEditDistance <= 0.15) return "auto_capped";
  if (positive >= 5 && approvals >= 3 && negative === 0 && avgEditDistance <= 0.25) return "supervised";
  return "gated";
}

export function levelFromTier(tier) {
  if (tier === "auto_capped") return 3;
  if (tier === "supervised") return 2;
  if (tier === "review") return 0;
  return 1;
}
