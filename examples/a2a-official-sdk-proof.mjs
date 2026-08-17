// Optional compatibility proof against the released A2A JavaScript SDK.
// Install @a2a-js/sdk@1.0.1 in the consumer project; it is deliberately not a
// runtime dependency of @trust-graduation/core.

import {
  TrustGraduation,
  a2aAgentExtension,
  a2aHttpHeaders,
  createApprovalGrant,
  toA2AApprovalMessage,
  toA2AAuthorizationTask,
  toA2AReceiptArtifact
} from "../src/index.js";

let sdk;
try {
  sdk = await import("@a2a-js/sdk");
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND" && String(error?.message || "").includes("@a2a-js/sdk")) {
    process.stderr.write("Install the optional verifier first: npm install --no-save @a2a-js/sdk@1.0.1\n");
    process.exit(2);
  }
  throw error;
}

const now = () => new Date("2026-08-17T12:00:00.000Z");
const trust = new TrustGraduation({ workspace: "workspace-1", now });
const review = trust.canExecute({
  actionClass: "email.send.external",
  context: {
    principal: "principal-1",
    requestedBy: "mail-agent",
    tenant: "tenant-1",
    target: "buyer@example.com",
    input: { to: "buyer@example.com", body: "Exact body" },
    constraints: { scope: "once" },
    expiresAt: "2026-08-17T12:05:00.000Z"
  }
});
const grant = createApprovalGrant({
  binding: review.actionBinding,
  grantId: "grant-1",
  issuer: "principal:principal-1",
  issuedAt: now().toISOString()
});
const taskWire = toA2AAuthorizationTask({
  decision: review,
  taskId: "task-1",
  contextId: "context-1",
  messageId: "message-1",
  timestamp: now().toISOString()
});
const approvalWire = toA2AApprovalMessage({
  grant,
  taskId: "task-1",
  contextId: "context-1",
  messageId: "message-2"
});
const artifactWire = toA2AReceiptArtifact({
  receipt: { receiptId: "receipt-1", actionHash: grant.actionHash },
  artifactId: "artifact-1"
});

const task = sdk.Task.fromJSON(taskWire);
const approval = sdk.Message.fromJSON(approvalWire);
const artifact = sdk.Artifact.fromJSON(artifactWire);
const extension = sdk.AgentExtension.fromJSON(a2aAgentExtension());
const taskRoundTrip = sdk.Task.toJSON(task);

if (sdk.A2A_PROTOCOL_VERSION !== "1.0") throw new Error("official SDK is not targeting A2A 1.0");
if (task.status?.state !== sdk.TaskState.TASK_STATE_AUTH_REQUIRED) throw new Error("AUTH_REQUIRED did not survive official SDK parsing");
if (task.status?.message?.parts[0]?.content?.$case !== "data") throw new Error("authorization request is not an SDK data Part");
if (approval.parts[0]?.content?.$case !== "data") throw new Error("approval is not an SDK data Part");
if (artifact.parts[0]?.content?.$case !== "data") throw new Error("receipt is not an SDK data Part");
if (extension.uri !== a2aAgentExtension().uri) throw new Error("AgentExtension URI drifted");
if (taskRoundTrip.status?.state !== "TASK_STATE_AUTH_REQUIRED") throw new Error("AUTH_REQUIRED did not survive ProtoJSON round trip");

const headers = a2aHttpHeaders();
console.log(`TRUST_A2A_OFFICIAL_SDK_PROOF ${JSON.stringify({
  ok: true,
  sdk: "@a2a-js/sdk@1.0.1",
  protocol: sdk.A2A_PROTOCOL_VERSION,
  version_header: `${sdk.A2A_VERSION_HEADER}: ${headers[sdk.A2A_VERSION_HEADER]}`,
  extension_header: `${sdk.HTTP_EXTENSION_HEADER}: ${headers[sdk.HTTP_EXTENSION_HEADER]}`,
  auth_required_round_trip: true,
  data_parts_round_trip: true,
  extension_round_trip: true,
  network_calls: 0
})}`);
