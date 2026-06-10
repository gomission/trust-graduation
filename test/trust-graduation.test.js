import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TrustGraduation, createLicenseToken, decodeLicenseToken, licenseAllows, summarizeEvidence } from "../src/index.js";

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
  assert.match(result.decisionId || "", /^tgd_/);
  assert.equal(result.createdAt, "2026-05-30T12:00:00.000Z");
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
});

test("explicit approval permits a gated external action once", () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: Array.from({ length: 12 }, () => ({ actionClass: "email.send.external", type: "approved" }))
  });

  const result = tg.canExecute({
    actionClass: "email.send.external",
    approval: { state: "approved", scope: "once" }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.needsApproval, false);
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
});

test("summarizes evidence objects and arrays", () => {
  assert.equal(summarizeEvidence({ actionClass: "draft.response", positive: 5 }).positive, 5);
  assert.equal(summarizeEvidence([{ actionClass: "draft.response", type: "rejected" }], "draft.response").negative, 1);
});

test("protocol license tokens expose future entitlements without gating local core", () => {
  const token = createLicenseToken({ subject: "integration-a", features: ["core", "approval-packets"] });
  const status = decodeLicenseToken(token);
  assert.equal(status.active, true);
  assert.equal(licenseAllows(status, "core"), true);
  assert.equal(licenseAllows(status, "federation"), false);
});

test("receipts v2 schema is present as forward design", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(repo, "schemas", "v2", "receipts.schema.json"), "utf8"));
  assert.equal(schema.properties.protocol.const, "trust-graduation-receipts");
  assert.ok(schema.required.includes("receiptId"));
  assert.ok(schema.required.includes("evidence"));
  assert.equal(schema.properties.evidence.required.includes("target"), true);
  assert.equal(schema.properties.evidence.required.includes("summary"), true);
});
