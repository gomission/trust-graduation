export const A2A_AUTHORIZATION_EXTENSION_URI = "https://trustgraduation.org/extensions/a2a/action-authorization/v1";
export const A2A_AUTHORIZATION_MEDIA_TYPE = "application/vnd.trustgraduation.authorization+json;version=1";
export const A2A_RECEIPT_MEDIA_TYPE = "application/vnd.trustgraduation.execution-receipt+json;version=1";

export function a2aAgentExtension({ required = false } = {}) {
  return {
    uri: A2A_AUTHORIZATION_EXTENSION_URI,
    description: "Binds in-task authorization to one exact action, target, input, principal, agent, tenant, expiry, and single execution; returns receipt evidence after execution.",
    required: Boolean(required),
    params: {
      version: "1.0",
      taskState: "TASK_STATE_AUTH_REQUIRED",
      authorizationMediaType: A2A_AUTHORIZATION_MEDIA_TYPE,
      receiptMediaType: A2A_RECEIPT_MEDIA_TYPE
    }
  };
}

/** Map a Trust Graduation review decision to an A2A v1 AUTH_REQUIRED Task. */
export function toA2AAuthorizationTask({
  decision,
  taskId,
  contextId,
  messageId,
  timestamp = new Date().toISOString()
} = {}) {
  if (!decision?.needsApproval || !decision?.packet?.actionBinding) {
    throw new Error("an approval-gated decision with packet.actionBinding is required");
  }
  if (!taskId || !contextId || !messageId) throw new Error("taskId, contextId, and messageId are required");

  const payload = {
    kind: "authorization_request",
    version: "1.0",
    decisionId: decision.decisionId,
    packetId: decision.packet.packetId,
    actionBinding: decision.packet.actionBinding,
    riskClass: decision.packet.riskClass,
    reason: decision.reason,
    decisions: decision.packet.decisions
  };

  return {
    id: String(taskId),
    contextId: String(contextId),
    status: {
      state: "TASK_STATE_AUTH_REQUIRED",
      timestamp: String(timestamp),
      message: {
        messageId: String(messageId),
        contextId: String(contextId),
        taskId: String(taskId),
        role: "ROLE_AGENT",
        parts: [{ data: payload, mediaType: A2A_AUTHORIZATION_MEDIA_TYPE }],
        extensions: [A2A_AUTHORIZATION_EXTENSION_URI],
        metadata: { [A2A_AUTHORIZATION_EXTENSION_URI]: payload }
      }
    },
    metadata: {
      [A2A_AUTHORIZATION_EXTENSION_URI]: {
        version: "1.0",
        actionHash: decision.packet.actionBinding.actionHash,
        decisionId: decision.decisionId
      }
    }
  };
}

/** Build the client-to-agent A2A message that carries a bounded grant. */
export function toA2AApprovalMessage({ grant, taskId, contextId, messageId } = {}) {
  if (!grant?.actionHash) throw new Error("grant.actionHash is required");
  if (!taskId || !contextId || !messageId) throw new Error("taskId, contextId, and messageId are required");

  const payload = { kind: "authorization_decision", version: "1.0", grant };
  return {
    messageId: String(messageId),
    contextId: String(contextId),
    taskId: String(taskId),
    role: "ROLE_USER",
    parts: [{ data: payload, mediaType: A2A_AUTHORIZATION_MEDIA_TYPE }],
    extensions: [A2A_AUTHORIZATION_EXTENSION_URI],
    metadata: { [A2A_AUTHORIZATION_EXTENSION_URI]: payload }
  };
}

/** Attach a completed execution receipt as an A2A Task artifact. */
export function toA2AReceiptArtifact({ receipt, artifactId, name = "Execution receipt" } = {}) {
  if (!receipt || typeof receipt !== "object") throw new Error("receipt is required");
  if (!artifactId) throw new Error("artifactId is required");
  return {
    artifactId: String(artifactId),
    name: String(name),
    description: "Receipt for the exact effect executed under the activated Trust Graduation authorization extension.",
    parts: [{ data: receipt, mediaType: A2A_RECEIPT_MEDIA_TYPE }],
    extensions: [A2A_AUTHORIZATION_EXTENSION_URI],
    metadata: { [A2A_AUTHORIZATION_EXTENSION_URI]: { version: "1.0", kind: "execution_receipt" } }
  };
}
