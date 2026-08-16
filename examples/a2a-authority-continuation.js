import {
  TrustGraduation,
  a2aAgentExtension,
  consumeApprovalGrant,
  createApprovalGrant,
  createMemoryGrantStore,
  toA2AApprovalMessage,
  toA2AAuthorizationTask,
  toA2AReceiptArtifact
} from "../src/index.js";

const now = () => new Date("2026-08-16T12:00:00.000Z");
const context = {
  principal: "principal-1",
  requestedBy: "mail-agent",
  tenant: "tenant-1",
  target: "buyer@example.com",
  input: { to: "buyer@example.com", subject: "Hello", body: "Exact body" },
  constraints: { scope: "once" },
  expiresAt: "2026-08-16T12:05:00.000Z",
  asynchronousApproval: true
};

const trust = new TrustGraduation({ workspace: "workspace-1", now });
const review = trust.canExecute({ actionClass: "email.send.external", context });

const task = toA2AAuthorizationTask({
  decision: review,
  taskId: "task-1",
  contextId: "context-1",
  messageId: "message-request-1",
  timestamp: now().toISOString()
});

// In production, Mission Key or another authenticated issuer presents the
// exact binding to the principal. A2A transport alone does not authenticate it.
const grant = createApprovalGrant({
  binding: review.actionBinding,
  grantId: "grant-1",
  issuer: "principal:principal-1",
  issuedAt: now().toISOString()
});

const approvalMessage = toA2AApprovalMessage({
  grant,
  taskId: "task-1",
  contextId: "context-1",
  messageId: "message-approval-1"
});

// The bundled memory store is process-local and exists only for this runnable
// example. Production uses a shared database compare-and-set/unique insert.
const authorization = await consumeApprovalGrant({
  binding: review.actionBinding,
  approval: grant,
  now: "2026-08-16T12:01:00.000Z",
  store: createMemoryGrantStore()
});
if (!authorization.ok) throw new Error(authorization.reason);

// The grant is now consumed. Invoke the real provider exactly once, without an
// automatic retry if its result becomes ambiguous.
const receipt = {
  protocol: "trust-graduation",
  version: "1.0",
  receiptId: "receipt-1",
  grantId: grant.grantId,
  actionClass: grant.actionClass,
  actionHash: grant.actionHash,
  outcome: "provider_confirmed",
  externalActionExecuted: true,
  humanApproved: true,
  createdAt: "2026-08-16T12:01:01.000Z"
};
const receiptArtifact = toA2AReceiptArtifact({ receipt, artifactId: "receipt-artifact-1" });

console.log(JSON.stringify({
  agentExtension: a2aAgentExtension(),
  task,
  approvalMessage,
  authorization,
  receiptArtifact
}, null, 2));
