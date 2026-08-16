import {
  TrustGraduation,
  bindAction,
  consumeApprovalGrant,
  createApprovalGrant,
  createMemoryGrantStore,
  validateApprovalGrant,
} from "./index.js";
import { toA2AAuthorizationTask } from "./a2a.js";

/** Run a zero-network proof of exact authorization, mutation failure, and replay failure. */
export async function runExactKeyDemo({ stdout = process.stdout } = {}) {
  const now = new Date("2026-08-16T09:00:00.000Z");
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const requestedAction = {
    to: "buyer@example.com",
    subject: "Exact subject",
    body: "Exact approved body",
  };
  const engine = new TrustGraduation({ workspace: "demo-workspace", now: () => now });
  const decision = engine.canExecute({
    actionClass: "email.send.external",
    context: {
      principal: "demo-principal",
      requestedBy: "demo-agent",
      tenant: "demo-tenant",
      target: requestedAction.to,
      input: requestedAction,
      expiresAt,
      nonce: "demo-nonce",
      asynchronousApproval: true,
    },
  });
  const binding = decision.packet.actionBinding;
  const grant = createApprovalGrant({
    binding,
    grantId: "demo-grant",
    issuer: "demo-principal",
    issuedAt: now.toISOString(),
    expiresAt,
  });
  const grantStore = createMemoryGrantStore();
  const authorized = await consumeApprovalGrant({ binding, approval: grant, now, store: grantStore });
  const mutatedBinding = bindAction({
    actionClass: binding.actionClass,
    workspace: binding.workspace,
    principal: binding.principal,
    requestedBy: binding.requestedBy,
    tenant: binding.tenant,
    target: binding.target,
    input: { ...requestedAction, body: "Changed after approval" },
    constraints: binding.constraints,
    expiresAt: binding.expiresAt,
    nonce: binding.nonce,
  });
  const mutation = validateApprovalGrant({ binding: mutatedBinding, approval: grant, now });
  const replay = await consumeApprovalGrant({ binding, approval: grant, now, store: grantStore });
  const unboundApproval = validateApprovalGrant({ binding, approval: { state: "approved" }, now });
  const a2aTask = toA2AAuthorizationTask({
    decision,
    taskId: "demo-task",
    contextId: "demo-context",
    messageId: "demo-message",
    timestamp: now.toISOString(),
  });

  const result = {
    ok: authorized.ok === true
      && mutation.ok === false
      && replay.ok === false
      && unboundApproval.ok === false,
    action_hash: binding.actionHash,
    atomic_consume_authorized: authorized.ok,
    mutation_rejected: mutation.reason,
    replay_rejected: replay.reason,
    plain_approval_rejected: unboundApproval.reason,
    scope: grant.scope,
    max_executions: grant.maxExecutions,
    a2a_task_state: a2aTask.status.state,
    provider_calls: 0,
  };
  stdout.write(`DEMO_RESULT ${JSON.stringify(result)}\n`);
  if (!result.ok) throw new Error("trust_graduation_exact_key_demo_failed");
  return result;
}
