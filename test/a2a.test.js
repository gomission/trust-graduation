import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  A2A_AUTHORIZATION_EXTENSION_URI,
  TrustGraduation,
  a2aAgentExtension,
  createApprovalGrant,
  toA2AApprovalMessage,
  toA2AAuthorizationTask,
  toA2AReceiptArtifact
} from "../src/index.js";

const now = () => new Date("2026-08-16T12:00:00.000Z");
const repo = path.resolve(new URL("..", import.meta.url).pathname);

function reviewDecision() {
  return new TrustGraduation({ workspace: "principal-1", now }).canExecute({
    actionClass: "email.send.external",
    context: {
      principal: "principal-1",
      requestedBy: "mail-agent",
      target: "buyer@example.com",
      input: { to: "buyer@example.com", subject: "Hello", body: "Exact body" },
      constraints: { scope: "once" },
      expiresAt: "2026-08-16T12:05:00.000Z",
      nonce: "nonce-1"
    }
  });
}

test("Agent Card extension declaration is versioned and optional by default", () => {
  const extension = a2aAgentExtension();
  assert.equal(extension.uri, A2A_AUTHORIZATION_EXTENSION_URI);
  assert.equal(extension.required, false);
  assert.equal(extension.params.version, "1.0");
});

test("review decision maps to an A2A v1 AUTH_REQUIRED task with extension metadata", () => {
  const task = toA2AAuthorizationTask({
    decision: reviewDecision(),
    taskId: "task-1",
    contextId: "context-1",
    messageId: "message-1",
    timestamp: "2026-08-16T12:00:00.000Z"
  });
  assert.equal(task.status.state, "TASK_STATE_AUTH_REQUIRED");
  assert.deepEqual(task.status.message.extensions, [A2A_AUTHORIZATION_EXTENSION_URI]);
  assert.match(task.metadata[A2A_AUTHORIZATION_EXTENSION_URI].actionHash, /^sha256:[0-9a-f]{64}$/);
});

test("bounded grant maps to an A2A user message and receipt maps to an artifact", () => {
  const review = reviewDecision();
  const grant = createApprovalGrant({
    binding: review.actionBinding,
    grantId: "grant-1",
    issuer: "principal:principal-1",
    issuedAt: "2026-08-16T12:00:00.000Z"
  });
  const message = toA2AApprovalMessage({ grant, taskId: "task-1", contextId: "context-1", messageId: "message-2" });
  assert.equal(message.role, "ROLE_USER");
  assert.equal(message.metadata[A2A_AUTHORIZATION_EXTENSION_URI].grant.actionHash, review.actionBinding.actionHash);

  const artifact = toA2AReceiptArtifact({ receipt: { receiptId: "receipt-1", actionHash: grant.actionHash }, artifactId: "artifact-1" });
  assert.equal(artifact.artifactId, "artifact-1");
  assert.deepEqual(artifact.extensions, [A2A_AUTHORIZATION_EXTENSION_URI]);
});

test("published extension schema copies match the package source schemas", () => {
  for (const filename of ["action-binding.schema.json", "approval-grant.schema.json"]) {
    const source = JSON.parse(fs.readFileSync(path.join(repo, "schemas", "extensions", "a2a", "action-authorization", "v1", filename), "utf8"));
    const published = JSON.parse(fs.readFileSync(path.join(repo, "site", "extensions", "a2a", "action-authorization", "v1", filename), "utf8"));
    assert.deepEqual(published, source, `${filename} site copy drifted from the package schema`);
  }
});
