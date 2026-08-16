import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TrustGraduation, consumeApprovalGrant, createApprovalGrant, createLicenseToken, createMemoryGrantStore, decodeLicenseToken, evidenceWeight, licenseAllows, normalizeActionClass, summarizeEvidence } from "../src/index.js";

const now = () => new Date("2026-05-30T12:00:00.000Z");
const repo = path.resolve(new URL("..", import.meta.url).pathname);

test("allows private drafting after clean supervised evidence", () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: [
      { actionClass: "draft.response", type: "approved" },
      { actionClass: "draft.response", type: "approved" },
      { actionClass: "draft.response", type: "approved" },
      { actionClass: "draft.response", type: "edited", editDistance: 0.1 },
      { actionClass: "draft.response", type: "sent_with_receipt" }
    ]
  });

  const result = tg.canExecute({ actionClass: "draft.response" });
  assert.equal(result.allowed, true);
  assert.equal(result.needsApproval, false);
  assert.equal(result.tier, "supervised");
  assert.equal(result.autonomyLevel, 2);
});

test("decision emits protocol-facing fields", () => {
  const tg = new TrustGraduation({ workspace: "user-123", now, evidence: [] });
  const result = tg.canExecute({
    actionClass: "draft.response",
    context: {
      principal: "user-123",
      requestedBy: "assistant",
      requestedAction: { draftType: "reply" },
      constraints: { scope: "once" }
    }
  });

  assert.equal(result.protocol, "trust-graduation");
  assert.equal(result.actionClass, "draft.response");
  assert.equal(result.requestedAction?.draftType, "reply");
  assert.equal(result.constraints?.scope, "once");
  assert.equal(result.status, "allowed");
  assert.match(result.decisionId || "", /^tgd_/);
  assert.equal(result.createdAt, "2026-05-30T12:00:00.000Z");
});

test("canonicalizes legacy action class aliases", () => {
  assert.equal(normalizeActionClass("payment.spend"), "payment.initiate");
  assert.equal(normalizeActionClass("calendar.create.external"), "calendar.create");
  assert.equal(normalizeActionClass("relationship_followup_drafting"), "draft.response");
});

test("external sends remain approval-gated even with clean evidence", () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: Array.from({ length: 12 }, () => ({ actionClass: "email.send.external", type: "approved" }))
  });

  const result = tg.canExecute({
    actionClass: "email.send.external",
    context: {
      principal: "user-123",
      requestedBy: "assistant",
      recipient: "buyer@example.com",
      constraints: { scope: "once" }
    }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.needsApproval, true);
  assert.equal(result.packet?.actionClass, "email.send.external");
  assert.equal(result.packet?.workspace, "user-123");
  assert.equal(result.packet?.decisionId, result.decisionId);
  assert.equal(result.packet?.principal, "user-123");
  assert.equal(result.packet?.requestedBy, "assistant");
  assert.equal(result.packet?.constraints?.scope, "once");
  assert.equal(result.packet?.actionBinding?.expiresAt, "2026-05-30T12:10:00.000Z");
  assert.match(result.packet?.actionBinding?.nonce || "", /^[0-9a-f-]{36}$/);
  assert.equal(result.graduationPath?.next_best_action, "prepareApprovalPacket");
  assert.equal(result.graduationPath?.safe_fallback_action_class, "draft.response");
  assert.ok(result.graduationPath?.required_evidence?.includes("principal approval receipt"));
});

test("an unbound approval cannot authorize a gated external action", () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: Array.from({ length: 12 }, () => ({ actionClass: "email.send.external", type: "approved" }))
  });

  const result = tg.canExecute({
    actionClass: "email.send.external",
    approval: { state: "approved", scope: "once" }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.needsApproval, true);
  assert.equal(result.status, "review_required");
  assert.match(result.reason, /approval_missing_action_hash/);
});

test("an exact action-bound approval becomes executable only after atomic consumption", async () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: Array.from({ length: 12 }, () => ({ actionClass: "email.send.external", type: "approved" }))
  });
  const context = {
    principal: "user-123",
    requestedBy: "mail-agent",
    target: "buyer@example.com",
    input: { to: "buyer@example.com", subject: "Hello", body: "Exact body" },
    constraints: { scope: "once" },
    expiresAt: "2026-05-30T12:05:00.000Z"
  };
  const review = tg.canExecute({ actionClass: "email.send.external", context });
  const approval = createApprovalGrant({
    binding: review.actionBinding,
    grantId: "grant-1",
    issuer: "principal:user-123",
    issuedAt: "2026-05-30T12:00:00.000Z"
  });
  const result = tg.canExecute({ actionClass: "email.send.external", context, approval });

  assert.equal(result.allowed, false);
  assert.equal(result.needsApproval, false);
  assert.equal(result.mode, "pending_atomic_consumption");
  assert.equal(result.requiresAtomicConsumption, true);
  assert.equal(result.actionBinding.actionHash, approval.actionHash);

  const authorization = await consumeApprovalGrant({
    binding: result.actionBinding,
    approval,
    now: "2026-05-30T12:01:00.000Z",
    store: createMemoryGrantStore()
  });
  assert.equal(authorization.ok, true);
  assert.equal(authorization.reason, "authorized_and_consumed_exact_action_once");
});

test("human-only payment class does not become agent-executable", () => {
  const tg = new TrustGraduation({ workspace: "user-123", now, evidence: [] });
  const result = tg.canExecute({
    actionClass: "payment.spend",
    approval: { state: "approved", scope: "once" }
  });

  assert.equal(result.actionClass, "payment.initiate");
  assert.equal(result.allowed, false);
  assert.equal(result.status, "human_only");
  assert.equal(result.mode, "human_only");
  assert.equal(result.graduationPath?.next_best_action, "stop");
});

test("bounded internal sends surface allowed_with_constraints", () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: Array.from({ length: 12 }, () => ({ actionClass: "email.send.internal", type: "approved" }))
  });

  const result = tg.canExecute({ actionClass: "email.send.internal" });
  assert.equal(result.allowed, true);
  assert.equal(result.status, "allowed_with_constraints");
  assert.deepEqual(result.constraints.rate_limit, { count: 5, window: "PT1H" });
});

test("trust issues force review", () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: [
      { actionClass: "draft.response", type: "approved" },
      { actionClass: "draft.response", type: "trust_issue" }
    ]
  });

  const result = tg.canExecute({ actionClass: "draft.response" });
  assert.equal(result.allowed, false);
  assert.equal(result.mode, "review_only");
  assert.equal(result.graduationPath?.next_best_action, "request_principal_approval");
});

test("summarizes evidence objects and arrays", () => {
  assert.equal(summarizeEvidence({ actionClass: "draft.response", positive: 5 }).positive, 5);
  assert.equal(summarizeEvidence([{ actionClass: "draft.response", type: "rejected" }], "draft.response").negative, 1);
});

test("composes decision and provenance evidence weights", () => {
  assert.equal(evidenceWeight({ type: "approved", sourceType: "connector" }), 0.255);
  assert.equal(evidenceWeight({ type: "rejected", sourceType: "model_inferred" }), -0.1);
  const summary = summarizeEvidence([
    { actionClass: "draft.response", type: "approved", sourceType: "connector" },
    { actionClass: "draft.response", type: "rejected", sourceType: "model_inferred" }
  ], "draft.response");
  assert.equal(summary.weightedPositive, 0.255);
  assert.equal(summary.weightedNegative, 0.1);
});

test("protocol license tokens expose future entitlements without gating local core", () => {
  const token = createLicenseToken({ subject: "integration-a", features: ["core", "approval-packets"] });
  const status = decodeLicenseToken(token);
  assert.equal(status.active, true);
  assert.equal(licenseAllows(status, "core"), true);
  assert.equal(licenseAllows(status, "federation"), false);
});

test("the earlier federated receipts v2 sketch remains available for design history", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(repo, "schemas", "v2", "receipts.schema.json"), "utf8"));
  assert.equal(schema.properties.protocol.const, "trust-graduation-receipts");
  assert.ok(schema.required.includes("receiptId"));
  assert.ok(schema.required.includes("evidence"));
  assert.equal(schema.properties.evidence.required.includes("target"), true);
  assert.equal(schema.properties.evidence.required.includes("summary"), true);
});
