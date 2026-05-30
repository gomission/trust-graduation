export type RiskClass = "low" | "medium" | "high" | "critical";
export type EvidenceTier = "gated" | "supervised" | "auto_capped" | "review";

export interface ActionPolicy {
  actionClass: string;
  lane?: string;
  riskClass: RiskClass;
  minimumLevel: number;
  requiresApproval: boolean;
  receiptRequired: boolean;
  externalSideEffects: string;
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
  decisions: number;
  avgEditDistance: number;
  rejectionRate: number;
}

export interface ApprovalPacket {
  protocol: "trust-graduation";
  version: string;
  packetId: string;
  workspace: string;
  requestedBy: string;
  actionClass: string;
  riskClass: RiskClass;
  externalSideEffects: string;
  approvalRequired: boolean;
  receiptRequired: boolean;
  reason: string;
  context: Record<string, unknown>;
  evidence: EvidenceSummary | Record<string, unknown>;
  decisions: Array<{ id: string; label: string; effect: string }>;
  createdAt: string;
}

export interface TrustDecision {
  protocol: "trust-graduation";
  version: string;
  allowed: boolean;
  needsApproval: boolean;
  mode: string;
  autonomyLevel: number;
  tier: EvidenceTier;
  policy: ActionPolicy;
  evidence: EvidenceSummary;
  reason: string;
  packet?: ApprovalPacket;
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

export function canExecute(input: CanExecuteRequest, options?: TrustGraduationOptions): TrustDecision;
export function summarizeEvidence(evidence?: EvidenceEvent[] | Partial<EvidenceSummary>, actionClass?: string): EvidenceSummary;
export function tierFromEvidence(summary?: Partial<EvidenceSummary>): EvidenceTier;
export function levelFromTier(tier: EvidenceTier): number;
export function buildApprovalPacket(input?: Record<string, unknown>): ApprovalPacket;
export function policyForActionClass(actionClass: string, policies?: ActionPolicy[]): ActionPolicy;
export function normalizeActionClass(actionClass?: string): string;
export function inferRiskClass(actionClass?: string): RiskClass;
export function inferExternalSideEffect(actionClass?: string): string;

