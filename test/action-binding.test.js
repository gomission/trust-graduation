import test from "node:test";
import assert from "node:assert/strict";

import {
  bindAction,
  canonicalJson,
  consumeApprovalGrant,
  createApprovalGrant,
  createMemoryGrantStore,
  digestObject,
  validateApprovalGrant
} from "../src/index.js";
import {
  canonicalJson as canonicalSchemaJson,
  digestObject as digestSchemaObject
} from "../packages/mission-schemas/src/canonicalization.mjs";

const binding = bindAction({
  actionClass: "email.send.external",
  workspace: "workspace-1",
  principal: "principal-1",
  requestedBy: "mail-agent",
  tenant: "tenant-1",
  target: "buyer@example.com",
  input: { to: "buyer@example.com", subject: "Hello", body: "Exact body" },
  constraints: { scope: "once" },
  expiresAt: "2026-08-16T12:05:00.000Z",
  nonce: "nonce-1"
});

const grant = createApprovalGrant({
  binding,
  grantId: "grant-1",
  issuer: "principal:principal-1",
  issuedAt: "2026-08-16T12:00:00.000Z"
});

test("root binding canonicalization stays byte-compatible with the conformance package", () => {
  const object = { z: [3, undefined, { b: true, a: "x" }], a: 1 };
  assert.equal(canonicalJson(object), canonicalSchemaJson(object));
  assert.equal(digestObject(object), digestSchemaObject(object));
});

test("exact action grant is eligible for atomic consumption before its expiry", () => {
  const result = validateApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:01:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "eligible_exact_action_pending_atomic_consumption");
});

test("atomic consumption authorizes one caller and rejects an unchanged replay", async () => {
  const store = createMemoryGrantStore();
  const first = await consumeApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:01:00.000Z", store });
  const replay = await consumeApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:01:01.000Z", store });

  assert.equal(first.ok, true);
  assert.equal(first.reason, "authorized_and_consumed_exact_action_once");
  assert.equal(first.approval.executionCount, 1);
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, "grant_already_consumed");
  assert.equal(grant.executionCount, 0, "consumption must not rely on mutating the presented grant");
});

test("concurrent consumers cannot both win the same grant", async () => {
  const store = createMemoryGrantStore();
  const results = await Promise.all([
    consumeApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:01:00.000Z", store }),
    consumeApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:01:00.000Z", store })
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === "grant_already_consumed").length, 1);
});

test("execution fails closed without a working atomic grant store", async () => {
  assert.equal((await consumeApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:01:00.000Z" })).reason, "atomic_grant_store_required");
  assert.equal((await consumeApprovalGrant({
    binding,
    approval: grant,
    now: "2026-08-16T12:01:00.000Z",
    store: { consume: async () => { throw new Error("offline"); } }
  })).reason, "grant_store_unavailable");
});

test("the reference store rejects a grant revoked before consumption", async () => {
  const store = createMemoryGrantStore();
  await store.revoke(grant);
  const result = await consumeApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:01:00.000Z", store });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "grant_revoked");
});

test("input mutation changes the action commitment and fails closed", () => {
  const mutated = bindAction({
    actionClass: "email.send.external",
    workspace: "workspace-1",
    principal: "principal-1",
    requestedBy: "mail-agent",
    tenant: "tenant-1",
    target: "buyer@example.com",
    input: { to: "buyer@example.com", subject: "Hello", body: "Mutated body" },
    constraints: { scope: "once" },
    expiresAt: "2026-08-16T12:05:00.000Z",
    nonce: "nonce-1"
  });
  const result = validateApprovalGrant({ binding: mutated, approval: grant, now: "2026-08-16T12:01:00.000Z" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "action_hash_mismatch");
});

test("expired, revoked, and already-consumed grants fail closed", () => {
  assert.equal(validateApprovalGrant({ binding, approval: grant, now: "2026-08-16T12:05:00.000Z" }).reason, "grant_expired");
  assert.equal(validateApprovalGrant({ binding, approval: { ...grant, revokedAt: "2026-08-16T12:01:00.000Z" }, now: "2026-08-16T12:02:00.000Z" }).reason, "grant_revoked");
  assert.equal(validateApprovalGrant({ binding, approval: { ...grant, executionCount: 1 }, now: "2026-08-16T12:02:00.000Z" }).reason, "grant_already_consumed");
});

test("tampered bindings, extended expiry, future issuance, and malformed counters fail closed", () => {
  assert.equal(validateApprovalGrant({ binding: { ...binding, target: "attacker@example.com" }, approval: grant, now: "2026-08-16T12:01:00.000Z" }).reason, "action_binding_integrity_failed");
  assert.equal(validateApprovalGrant({ binding, approval: { ...grant, expiresAt: "2026-08-16T13:05:00.000Z" }, now: "2026-08-16T12:01:00.000Z" }).reason, "grant_expiry_mismatch");
  assert.equal(validateApprovalGrant({ binding, approval: { ...grant, issuedAt: "2026-08-16T12:02:00.000Z" }, now: "2026-08-16T12:01:00.000Z" }).reason, "grant_not_yet_valid");
  assert.equal(validateApprovalGrant({ binding, approval: { ...grant, executionCount: "0" }, now: "2026-08-16T12:01:00.000Z" }).reason, "grant_execution_count_invalid");
});

test("grant issuance and validation require a fresh nonce and recognized protocol", () => {
  const withoutNonce = bindAction({
    actionClass: "email.send.external",
    workspace: "workspace-1",
    principal: "principal-1",
    input: { body: "Exact body" },
    expiresAt: "2026-08-16T12:05:00.000Z"
  });
  assert.throws(() => createApprovalGrant({ binding: withoutNonce, grantId: "grant-2", issuer: "principal-1" }), /binding\.nonce is required/);
  assert.equal(validateApprovalGrant({ binding: withoutNonce, approval: grant, now: "2026-08-16T12:01:00.000Z" }).reason, "action_binding_nonce_missing");
  assert.equal(validateApprovalGrant({ binding, approval: { ...grant, protocol: "unknown" }, now: "2026-08-16T12:01:00.000Z" }).reason, "approval_protocol_invalid");
});
