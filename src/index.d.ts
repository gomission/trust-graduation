export type RiskClass = "low" | "medium" | "high" | "critical";
export type EvidenceTier = "gated" | "supervised" | "auto_capped" | "review";
export type DecisionStatus = "allowed" | "allowed_with_constraints" | "review_required" | "deferred" | "blocked" | "human_only";
export type DecisionMode = "allowed" | "supervised" | "auto_capped" | "approval_required" | "review_only" | "insufficient_evidence" | "denied" | "pending_atomic_consumption" | "human_only";

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
  actionBinding?: ActionBinding;
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
  actionBinding?: ActionBinding;
  reason: string;
  packet?: ApprovalPacket;
  createdAt?: string;
  requiresAtomicConsumption?: boolean;
}

export interface CanExecuteRequest {
  actionClass: string;
  context?: Record<string, unknown>;
  approval?: { state?: string; [key: string]: unknown };
}

export interface ActionBinding {
  protocol: "trust-graduation-action-binding";
  version: "1.0";
  actionClass: string;
  workspace: string;
  principal: string;
  requestedBy: string;
  tenant: string;
  target: string;
  inputHash: string;
  actionHash: string;
  constraints: Record<string, unknown>;
  expiresAt?: string;
  nonce?: string;
}

export interface ApprovalGrant {
  protocol: "trust-graduation-authorization";
  version: "1.0";
  state: "approved";
  grantId: string;
  issuer: string;
  principal: string;
  requestedBy: string;
  workspace: string;
  tenant: string;
  actionClass: string;
  target: string;
  inputHash: string;
  actionHash: string;
  nonce: string;
  scope: "once";
  maxExecutions: 1;
  executionCount: number;
  issuedAt: string;
  expiresAt: string;
  revocable: true;
  revocationHandle?: string;
  revokedAt?: string;
  signature?: Record<string, unknown>;
}

export interface TrustGraduationOptions {
  workspace?: string;
  evidence?: EvidenceEvent[] | Partial<EvidenceSummary>;
  policies?: ActionPolicy[];
  now?: () => Date;
}

export interface GrantConsumptionInput {
  grantId: string;
  issuer: string;
  tenant: string;
  workspace: string;
  principal: string;
  actionHash: string;
  expiresAt: string;
  revocationHandle?: string;
}

export interface GrantConsumptionResult {
  ok: boolean;
  reason?: "grant_revoked" | "grant_already_consumed";
}

export interface AtomicGrantStore {
  consume(input: Readonly<GrantConsumptionInput>): boolean | GrantConsumptionResult | Promise<boolean | GrantConsumptionResult>;
  revoke?(input: Readonly<GrantConsumptionInput>): boolean | Promise<boolean>;
}

export interface ApprovalGrantValidation {
  ok: boolean;
  reason: string;
  binding?: ActionBinding;
  approval?: Partial<ApprovalGrant>;
  consumedAt?: string;
}

export interface ProviderAction {
  actionClass: string;
  workspace?: string;
  principal?: string;
  requestedBy?: string;
  tenant?: string;
  target: string;
  input: unknown;
  constraints?: Record<string, unknown>;
  expiresAt?: string;
  nonce?: string;
}

export interface ProviderExecutionReceipt {
  protocol: "trust-graduation";
  version: "1.0";
  receiptId: string;
  grantId: string;
  actionClass: string;
  actionHash: string;
  outcome: "provider_confirmed" | "provider_confirmed_result_unlinked" | "provider_outcome_unknown";
  externalActionExecuted: boolean | null;
  humanApproved: true;
  createdAt: string;
  providerResultHash?: string;
  providerErrorCode?: string;
}

export interface ProviderGateExecution {
  ok: boolean;
  reason: string;
  providerCalled: boolean;
  outcomeUnknown: boolean;
  binding?: ActionBinding;
  authorization?: ApprovalGrantValidation;
  providerResult?: unknown;
  receipt?: ProviderExecutionReceipt;
  detail?: string;
}

export interface ProviderGate {
  prepare(action: ProviderAction): ActionBinding;
  execute(input: {
    binding: ActionBinding;
    approval?: Partial<ApprovalGrant> | null;
    action: ProviderAction;
  }): Promise<ProviderGateExecution>;
}

export interface ProviderGateDependencies {
  store: AtomicGrantStore;
  authenticateGrant(input: Readonly<{
    approval?: Partial<ApprovalGrant> | null;
    binding: ActionBinding;
    action: ProviderAction;
  }>): boolean | { ok: boolean; reason?: string } | Promise<boolean | { ok: boolean; reason?: string }>;
  provider(input: unknown, context: Readonly<Record<string, unknown>>): unknown | Promise<unknown>;
  writeReceipt(receipt: ProviderExecutionReceipt): unknown | Promise<unknown>;
  now?: () => Date | string;
  createId?: () => string;
  resultEvidence?: (result: unknown) => unknown | Promise<unknown>;
  grantLifetimeMs?: number;
}

export interface StagehandDeterministicAction {
  selector: string;
  description: string;
  method: string;
  arguments: string[];
}

export interface StagehandBoundPage {
  url: string;
  origin: string;
  pageId: string;
  sessionId: string;
}

export interface StagehandExpectedEffect {
  target: string;
  payload: unknown;
  payloadHash: string;
  expectedEvidence?: unknown;
}

export interface StagehandProviderAction extends ProviderAction {
  input: {
    protocol: "trust-graduation-stagehand-provider-action";
    version: "0.1";
    stagehandAction: StagehandDeterministicAction;
    page: StagehandBoundPage;
    effect: StagehandExpectedEffect;
  };
  constraints: Record<string, unknown> & {
    deterministicStagehandActionRequired: true;
    downstreamEffectConfirmationRequired: true;
    rawStagehandBypassProhibited: true;
  };
}

export interface StagehandPageContext {
  url: string;
  pageId: string;
  sessionId: string;
  page?: unknown;
}

export interface StagehandEffectConfirmation {
  ok: boolean;
  providerEventId?: string;
  target?: string;
  payloadHash?: string;
  evidence?: unknown;
}

export interface StagehandProviderGateDependencies {
  stagehand: {
    act(action: StagehandDeterministicAction, options?: { page?: unknown }): unknown | Promise<unknown>;
  };
  getPageContext(input: Readonly<{
    action: StagehandProviderAction;
    binding: ActionBinding;
  }>): StagehandPageContext | Promise<StagehandPageContext>;
  confirmEffect(input: Readonly<{
    expected: Readonly<StagehandExpectedEffect>;
    action: StagehandDeterministicAction;
    page: Readonly<StagehandBoundPage>;
    stagehandResult: unknown;
    context: Readonly<Record<string, unknown>>;
  }>): StagehandEffectConfirmation | Promise<StagehandEffectConfirmation>;
  store: AtomicGrantStore;
  authenticateGrant: ProviderGateDependencies["authenticateGrant"];
  writeReceipt: ProviderGateDependencies["writeReceipt"];
  now?: () => Date | string;
  createId?: () => string;
  grantLifetimeMs?: number;
}

export interface StagehandProviderGate {
  prepare(action: StagehandProviderAction): ActionBinding;
  execute(input: {
    binding: ActionBinding;
    approval?: Partial<ApprovalGrant> | null;
    action: StagehandProviderAction;
  }): Promise<ProviderGateExecution>;
}

export interface ProviderGateConformanceResult {
  protocol: "trust-graduation-provider-gate-conformance";
  version: "0.2";
  ok: boolean;
  checks: Record<string, boolean>;
  provider_calls: Record<string, number>;
  receipts_written: number;
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
export function canonicalJson(value: unknown): string;
export function digestObject(value: unknown): string;
export function bindAction(input: Record<string, unknown>): ActionBinding;
export function createApprovalGrant(input: { binding: ActionBinding; grantId: string; issuer: string; issuedAt?: string; expiresAt?: string; revocationHandle?: string }): ApprovalGrant;
export function validateApprovalGrant(input: { binding: ActionBinding; approval?: Partial<ApprovalGrant> | null; now?: Date | string }): ApprovalGrantValidation;
export function createMemoryGrantStore(): AtomicGrantStore;
export function consumeApprovalGrant(input: { binding: ActionBinding; approval?: Partial<ApprovalGrant> | null; now?: Date | string; store?: AtomicGrantStore }): Promise<ApprovalGrantValidation>;
export function createProviderGate(dependencies: ProviderGateDependencies): ProviderGate;
export function createStagehandProviderAction(input: {
  actionClass: string;
  workspace?: string;
  principal?: string;
  requestedBy?: string;
  tenant?: string;
  stagehandAction: StagehandDeterministicAction;
  pageUrl: string;
  pageId: string;
  sessionId: string;
  effect: {
    target: string;
    payload: unknown;
    expectedEvidence?: unknown;
  };
  constraints?: Record<string, unknown>;
  expiresAt?: string;
  nonce?: string;
}): StagehandProviderAction;
export function createStagehandProviderGate(
  dependencies: StagehandProviderGateDependencies
): StagehandProviderGate;
export function runProviderGateConformance(input: {
  createGate(dependencies: ProviderGateDependencies): ProviderGate | Promise<ProviderGate>;
}): Promise<ProviderGateConformanceResult>;
export const A2A_AUTHORIZATION_EXTENSION_URI: string;
export const A2A_AUTHORIZATION_MEDIA_TYPE: string;
export const A2A_RECEIPT_MEDIA_TYPE: string;
export function a2aAgentExtension(input?: { required?: boolean }): Record<string, unknown>;
export function toA2AAuthorizationTask(input: Record<string, unknown>): Record<string, unknown>;
export function toA2AApprovalMessage(input: Record<string, unknown>): Record<string, unknown>;
export function toA2AReceiptArtifact(input: Record<string, unknown>): Record<string, unknown>;
export function policyForActionClass(actionClass: string, policies?: ActionPolicy[]): ActionPolicy;
export function normalizeActionClass(actionClass?: string): string;
export function inferRiskClass(actionClass?: string): RiskClass;
export function inferExternalSideEffect(actionClass?: string): string;
export function createLicenseToken(payload?: Record<string, unknown>): string;
export function decodeLicenseToken(token?: string): Record<string, unknown>;
export function licenseAllows(status?: Record<string, unknown>, entitlement?: string): boolean;
