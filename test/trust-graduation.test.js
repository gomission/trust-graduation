import test from "node:test";
import assert from "node:assert/strict";
import { TrustGraduation, summarizeEvidence } from "../src/index.js";

const now = () => new Date("2026-05-30T12:00:00.000Z");

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

test("external sends remain approval-gated even with clean evidence", () => {
  const tg = new TrustGraduation({
    workspace: "user-123",
    now,
    evidence: Array.from({ length: 12 }, () => ({ actionClass: "email.send.external", type: "approved" }))
  });

  const result = tg.canExecute({
    actionClass: "email.send.external",
    context: { recipient: "buyer@example.com" }
  });

  assert.equal(result.allowed, false);
  assert.equal(result.needsApproval, true);
  assert.equal(result.packet.actionClass, "email.send.external");
  assert.equal(result.packet.workspace, "user-123");
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

