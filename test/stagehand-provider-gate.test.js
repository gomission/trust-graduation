import test from "node:test";
import assert from "node:assert/strict";

import {
  createApprovalGrant,
  createMemoryGrantStore,
  createStagehandProviderAction,
  createStagehandProviderGate
} from "../src/index.js";

const now = new Date("2026-08-17T09:00:00.000Z");

function deterministicAction(overrides = {}) {
  return {
    selector: "xpath=/html/body/main/form/button",
    description: "Click the final submit button",
    method: "click",
    arguments: [],
    ...overrides
  };
}

function providerAction(overrides = {}) {
  return createStagehandProviderAction({
    actionClass: "browser.form.submit.external",
    workspace: "workspace-1",
    principal: "principal-1",
    requestedBy: "stagehand-agent",
    tenant: "tenant-1",
    stagehandAction: deterministicAction(),
    pageUrl: "https://sandbox.example.test/checkout?order=42",
    pageId: "page-1",
    sessionId: "session-1",
    effect: {
      target: "orders/42/submit",
      payload: { orderId: "42", confirm: true },
      expectedEvidence: { eventType: "order.submitted" }
    },
    constraints: { environment: "sandbox" },
    expiresAt: "2026-08-17T09:10:00.000Z",
    nonce: "nonce-1",
    ...overrides
  });
}

function stagehandSuccess(action = deterministicAction()) {
  return {
    data: {
      success: true,
      message: "Action performed",
      actionDescription: action.description,
      actions: [action]
    },
    metadata: { usage: {}, cache: {} }
  };
}

function grant(binding, grantId = "grant-1") {
  return createApprovalGrant({
    binding,
    grantId,
    issuer: "principal:principal-1",
    issuedAt: now.toISOString()
  });
}

function gateFixture(overrides = {}) {
  let stagehandCalls = 0;
  let confirmationCalls = 0;
  const receipts = [];
  const stagehand = overrides.stagehand || {
    async act(action) {
      stagehandCalls += 1;
      return stagehandSuccess(action);
    }
  };
  const gate = createStagehandProviderGate({
    stagehand,
    getPageContext: overrides.getPageContext || (async () => ({
      url: "https://sandbox.example.test/checkout?order=42",
      pageId: "page-1",
      sessionId: "session-1"
    })),
    confirmEffect: overrides.confirmEffect || (async ({ expected }) => {
      confirmationCalls += 1;
      return {
        ok: true,
        providerEventId: "evt-order-42",
        target: expected.target,
        payloadHash: expected.payloadHash,
        evidence: { eventType: "order.submitted", status: "accepted" }
      };
    }),
    store: overrides.store || createMemoryGrantStore(),
    authenticateGrant: overrides.authenticateGrant || (async () => true),
    writeReceipt: overrides.writeReceipt || (async (receipt) => {
      receipts.push(receipt);
      return { ok: true };
    }),
    now: () => now,
    createId: (() => {
      let value = 0;
      return () => `stagehand-receipt-${++value}`;
    })()
  });
  return {
    gate,
    receipts,
    stagehandCalls: () => stagehandCalls,
    confirmationCalls: () => confirmationCalls
  };
}

test("Stagehand provider actions reject natural-language and unresolved-variable execution", () => {
  assert.throws(
    () => providerAction({ stagehandAction: "click the submit button" }),
    /natural-language Stagehand actions are not exact authority/
  );
  assert.throws(
    () => providerAction({
      stagehandAction: deterministicAction({
        method: "fill",
        arguments: ["%email%"]
      })
    }),
    /resolve Stagehand %variables% before requesting authority/
  );
});

test("one exact grant permits one confirmed Stagehand effect while missing approval, mutation, and replay make zero extra calls", async () => {
  const fixture = gateFixture();
  const requested = providerAction();
  const binding = fixture.gate.prepare(requested);
  const approval = grant(binding);

  const missing = await fixture.gate.execute({ binding, approval: null, action: requested });
  const mutation = await fixture.gate.execute({
    binding,
    approval,
    action: providerAction({
      effect: {
        target: "orders/42/submit",
        payload: { orderId: "42", confirm: false }
      }
    })
  });
  const valid = await fixture.gate.execute({ binding, approval, action: requested });
  const replay = await fixture.gate.execute({ binding, approval, action: requested });

  assert.equal(missing.providerCalled, false);
  assert.equal(mutation.reason, "action_hash_mismatch");
  assert.equal(valid.ok, true);
  assert.equal(valid.reason, "provider_confirmed");
  assert.equal(valid.providerResult.providerEventId, "evt-order-42");
  assert.equal(valid.providerResult.target, "orders/42/submit");
  assert.equal(replay.reason, "grant_already_consumed");
  assert.equal(fixture.stagehandCalls(), 1);
  assert.equal(fixture.confirmationCalls(), 1);
  assert.equal(fixture.receipts.length, 1);
  assert.match(fixture.receipts[0].providerResultHash, /^sha256:[a-f0-9]{64}$/);
});

test("simultaneous consumers still produce exactly one Stagehand action", async () => {
  const fixture = gateFixture();
  const requested = providerAction();
  const binding = fixture.gate.prepare(requested);
  const approval = grant(binding, "grant-race");

  const results = await Promise.all([
    fixture.gate.execute({ binding, approval, action: requested }),
    fixture.gate.execute({ binding, approval, action: requested })
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === "grant_already_consumed").length, 1);
  assert.equal(fixture.stagehandCalls(), 1);
  assert.equal(fixture.confirmationCalls(), 1);
});

test("issuer rejection and atomic-store failure occur before any Stagehand action", async () => {
  const issuerFixture = gateFixture({
    authenticateGrant: async () => ({ ok: false, reason: "issuer_signature_invalid" })
  });
  const issuerAction = providerAction();
  const issuerBinding = issuerFixture.gate.prepare(issuerAction);
  const issuerResult = await issuerFixture.gate.execute({
    binding: issuerBinding,
    approval: grant(issuerBinding, "grant-bad-issuer"),
    action: issuerAction
  });

  const storeFixture = gateFixture({
    store: {
      async consume() {
        throw new Error("atomic store unavailable");
      }
    }
  });
  const storeAction = providerAction();
  const storeBinding = storeFixture.gate.prepare(storeAction);
  const storeResult = await storeFixture.gate.execute({
    binding: storeBinding,
    approval: grant(storeBinding, "grant-store-down"),
    action: storeAction
  });

  assert.equal(issuerResult.reason, "issuer_signature_invalid");
  assert.equal(storeResult.reason, "grant_store_unavailable");
  assert.equal(issuerFixture.stagehandCalls(), 0);
  assert.equal(storeFixture.stagehandCalls(), 0);
  assert.equal(issuerFixture.confirmationCalls(), 0);
  assert.equal(storeFixture.confirmationCalls(), 0);
});

test("a successful DOM action without downstream confirmation is outcome unknown and cannot replay", async () => {
  let confirmationCalls = 0;
  const fixture = gateFixture({
    confirmEffect: async () => {
      confirmationCalls += 1;
      return { ok: false };
    }
  });
  const requested = providerAction();
  const binding = fixture.gate.prepare(requested);
  const approval = grant(binding, "grant-unconfirmed");

  const result = await fixture.gate.execute({ binding, approval, action: requested });
  const replay = await fixture.gate.execute({ binding, approval, action: requested });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.outcomeUnknown, true);
  assert.equal(result.receipt.externalActionExecuted, null);
  assert.equal(result.receipt.providerErrorCode, "StagehandEffectConfirmationError");
  assert.equal(replay.reason, "grant_already_consumed");
  assert.equal(fixture.stagehandCalls(), 1);
  assert.equal(confirmationCalls, 1);
});

test("downstream confirmation must match the approved target and payload hash", async () => {
  const fixture = gateFixture({
    confirmEffect: async ({ expected }) => ({
      ok: true,
      providerEventId: "evt-wrong-target",
      target: "orders/99/submit",
      payloadHash: expected.payloadHash,
      evidence: { eventType: "order.submitted" }
    })
  });
  const requested = providerAction();
  const binding = fixture.gate.prepare(requested);
  const result = await fixture.gate.execute({
    binding,
    approval: grant(binding, "grant-confirmation-mismatch"),
    action: requested
  });

  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.receipt.providerErrorCode, "StagehandEffectConfirmationMismatchError");
  assert.equal(fixture.stagehandCalls(), 1);
});

test("page, tab, or session drift consumes authority safely without calling Stagehand", async () => {
  const fixture = gateFixture({
    getPageContext: async () => ({
      url: "https://sandbox.example.test/checkout?order=99",
      pageId: "page-2",
      sessionId: "session-1"
    })
  });
  const requested = providerAction();
  const binding = fixture.gate.prepare(requested);

  const result = await fixture.gate.execute({
    binding,
    approval: grant(binding, "grant-page-drift"),
    action: requested
  });

  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.receipt.providerErrorCode, "StagehandPageContextMismatchError");
  assert.equal(fixture.stagehandCalls(), 0);
  assert.equal(fixture.confirmationCalls(), 0);
});

test("Stagehand self-heal or performed-action drift is not accepted as the approved action", async () => {
  let stagehandCalls = 0;
  let confirmationCalls = 0;
  const fixture = gateFixture({
    stagehand: {
      async act() {
        stagehandCalls += 1;
        return stagehandSuccess(deterministicAction({
          selector: "xpath=/html/body/main/form/button[2]"
        }));
      }
    },
    confirmEffect: async () => {
      confirmationCalls += 1;
      return { ok: true };
    }
  });
  const requested = providerAction();
  const binding = fixture.gate.prepare(requested);
  const result = await fixture.gate.execute({
    binding,
    approval: grant(binding, "grant-self-heal"),
    action: requested
  });

  assert.equal(result.reason, "provider_outcome_unknown");
  assert.equal(result.receipt.providerErrorCode, "StagehandActionResultMismatchError");
  assert.equal(stagehandCalls, 1);
  assert.equal(confirmationCalls, 0);
});

test("the adapter snapshots mutable input before asynchronous issuer authentication", async () => {
  const requested = JSON.parse(JSON.stringify(providerAction()));
  let actedSelector = "";
  const fixture = gateFixture({
    stagehand: {
      async act(action) {
        actedSelector = action.selector;
        return stagehandSuccess(action);
      }
    },
    authenticateGrant: async () => {
      requested.input.stagehandAction.selector = "xpath=/html/body/button[@data-mutated='true']";
      return true;
    }
  });
  const binding = fixture.gate.prepare(requested);
  const result = await fixture.gate.execute({
    binding,
    approval: grant(binding, "grant-snapshot"),
    action: requested
  });

  assert.equal(result.ok, true);
  assert.equal(actedSelector, "xpath=/html/body/main/form/button");
});
