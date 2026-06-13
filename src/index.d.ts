export type RiskClass = "low" | "medium" | "high" | "critical";
export type EvidenceTier = "gated" | "supervised" | "auto_capped" | "review";
export type DecisionStatus = "allowed" | "allowed_with_constraints" | "review_required" | "deferred" | "blocked" | "human_only";
export type DecisionMode = "allowed" | "supervised" | "auto_capped" | "approval_required" | "review_only" | "insufficient_evidence" | "denied" | "approved_once" | "human_only";

export interface ActionPolicy {
  actionClass: string;
  lane?: string;
  riskClass: RiskClass;
  minimumLevel: number;
  requiresApproval: boolean;
  receiptRequired: boolean;
  humanOnly?: boolean;
  externalSideEffects: string;
  constraints?: Record<string, unknown>;
  description?: string;
}

export interface EvidenceEvent {
  actionClass?: string;
  action_class?: string;
  type?: string;
  eventType?: string;
  event_type?: string;
  decision?: string;
  source?: string;
  evidenceSource?: string;
  evidence_source?: string;
  sourceType?: "receipt" | "principal" | "connector" | "model_inferred";
  source_type?: "receipt" | "principal" | "connector" | "model_inferred";
  decisionWeight?: number;
  decision_weight?: number;
  provenanceWeight?: number;
  provenance_weight?: number;
  evidenceWeight?: number;
  evidence_weight?: number;
  editDistance?: number;
  edit_distance?: number;
  [key: string]: unknown;
}

export interface EvidenceSummary {
  actionClass: string;
  evidenceSources: string[];
  approvals: number;
  edits: number;
  rejections: number;
  held: number;
  receipts: number;
  outcomes: number;
  trustIssues: number;
  rollbacks: number;
  positive: number;
  negative: number;
  weightedPositive: number;
  weightedNegative: number;
  decisions: number;
  avgEditDistance: number;
  rejectionRate: number;
}

export interface ApprovalDecisionOption {
  id: string;
  label: string;
  effect: string;
}

export interface ApprovalPacket {
  protocol: "trust-graduation";
  version: string;
  packetId: string;
  decisionId?: string;
  workspace?: string;
  scope?: string;
  requestedBy?: string;
  principal?: string;
  actionClass: string;
  riskClass: RiskClass;
  externalSideEffects: string;
  approvalRequired: boolean;
  receiptRequired: boolean;
  reason: string;
  requestedAction?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  context: Record<string, unknown>;
  evidence: EvidenceSummary | Record<string, unknown>;
  decisions: ApprovalDecisionOption[];
  createdAt: string;
  expiresAt?: string;
}

export interface TrustDecision {
  protocol: "trust-graduation";
  version: string;
  decisionId?: string;
  actionClass?: string;
  requestedAction?: Record<string, unknown>;
  allowed: boolean;
  needsApproval: boolean;
  status: DecisionStatus;
  mode: DecisionMode;
  autonomyLevel: number;
  tier: EvidenceTier;
  policy: ActionPolicy;
  evidence: EvidenceSummary;
  constraints?: Record<string, unknown>;
  reason: string;
  packet?: ApprovalPacket;
  createdAt?: string;
}

export interface CanExecuteRequest {
  actionClass: string;
  context?: Record<string, unknown>;
  approval?: { state?: string; [key: string]: unknown };
}

export interface TrustGraduationOptions {
  workspace?: string;
  evidence?: EvidenceEvent[] | Partial<EvidenceSummary>;
  policies?: ActionPolicy[];
  now?: () => Date;
}

export class TrustGraduation {
  constructor(options?: TrustGraduationOptions);
  canExecute(request: CanExecuteRequest): TrustDecision;
}

export const AUTONOMY_LEVELS: Array<{ level: number; name: string; description: string }>;
export const DEFAULT_ACTION_POLICIES: ActionPolicy[];
export const ACTION_CLASS_ALIASES: Record<string, string>;
export const DECISION_WEIGHTS: Record<string, number>;
export const PROVENANCE_WEIGHTS: Record<string, number>;

export function canExecute(input: CanExecuteRequest, options?: TrustGraduationOptions): TrustDecision;
export function summarizeEvidence(evidence?: EvidenceEvent[] | Partial<EvidenceSummary>, actionClass?: string): EvidenceSummary;
export function decisionWeight(entry?: EvidenceEvent): number;
export function provenanceWeight(entry?: EvidenceEvent): number;
export function evidenceWeight(entry?: EvidenceEvent): number;
export function tierFromEvidence(summary?: Partial<EvidenceSummary>): EvidenceTier;
export function levelFromTier(tier: EvidenceTier): number;
export function buildApprovalPacket(input?: Record<string, unknown>): ApprovalPacket;
export function policyForActionClass(actionClass: string, policies?: ActionPolicy[]): ActionPolicy;
export function normalizeActionClass(actionClass?: string): string;
export function inferRiskClass(actionClass?: string): RiskClass;
export function inferExternalSideEffect(actionClass?: string): string;
export function createLicenseToken(payload?: Record<string, unknown>): string;
export function decodeLicenseToken(token?: string): Record<string, unknown>;
export function licenseAllows(status?: Record<string, unknown>, entitlement?: string): boolean;
