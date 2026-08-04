// Copyright 2026 Phenomena Labs Ltd
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALL_SCHEMAS,
  ACTION_CLASSES,
  actionClassSpec,
  isKnownActionClass,
  SCHEMA_ACTION,
  SCHEMA_GRANT,
  SCHEMA_DECISION_V1,
  SCHEMA_DECISION,
  SCHEMA_POLICY,
  SCHEMA_EXECUTION,
  SCHEMA_RECEIPT,
  SCHEMA_OUTCOME,
  SCHEMA_AUTHORITY_INTERRUPTION,
  SCHEMA_SIGNATURE,
  SCHEMA_PUBLIC_KEY_MANIFEST,
  CURRENT_RECEIPT_SCHEMA,
  CURRENT_DECISION_SCHEMA,
  canonicalJson,
  digestObject,
  computeReceiptDigests,
  receiptSigningBytes,
  validate,
  validateReceiptChain,
  allSchemas,
  getSchema,
} from "../src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "..", "fixtures");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("versions.mjs enumerates every schema and current pointers select the hardened versions", () => {
  const expected = [
    "mission-action/v1",
    "mission-grant/v1",
    "mission-decision/v1",
    "mission-decision/v2",
    "mission-capability-policy/v1",
    "mission-desktop-execution/v1",
    "mission-execution-receipt/v1",
    "mission-execution-receipt/v2",
    "mission-outcome/v1",
    "mission-authority-interruption/v1",
    "mission-receipt-signature/v1",
    "mission-public-key-manifest/v1",
    "mission-horizon-prompt/v1",
  ];
  for (const id of expected) assert.ok(ALL_SCHEMAS.includes(id), `ALL_SCHEMAS should include ${id}`);
  assert.equal(CURRENT_RECEIPT_SCHEMA, "mission-execution-receipt/v2");
  assert.equal(CURRENT_DECISION_SCHEMA, "mission-decision/v2");
});

test("action-classes vocabulary carries risk_class and external_side_effects for every capability", () => {
  for (const [name, spec] of Object.entries(ACTION_CLASSES)) {
    assert.ok(spec.risk_class, `${name} must declare risk_class`);
    assert.ok(spec.external_side_effects, `${name} must declare external_side_effects`);
    assert.equal(isKnownActionClass(name), true);
    assert.deepEqual(actionClassSpec(name), spec);
  }
  assert.equal(isKnownActionClass("email.send.external"), true);
  assert.equal(isKnownActionClass("agent.plan.prepare"), true);
  assert.equal(isKnownActionClass("unknown.capability"), false);
});

test("canonicalJson is stable across insertion order and refuses non-finite numbers", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), canonicalJson({ a: 2, b: 1 }));
  assert.equal(canonicalJson({ a: 1 }), '{"a":1}');
  assert.throws(() => canonicalJson({ x: NaN }), /canonical_json_non_finite_number/);
});

test("digestObject is deterministic and computeReceiptDigests fills all five", () => {
  assert.equal(digestObject({ a: 1, b: 2 }), digestObject({ b: 2, a: 1 }));
  assert.match(digestObject({ a: 1 }), /^sha256:[0-9a-f]{64}$/);
  const digests = computeReceiptDigests({ action: { a: 1 }, grant: { g: 1 }, decision: { d: 1 }, policy: { p: 1 }, payload: { pl: 1 } });
  for (const key of ["action", "grant", "decision", "policy", "payload"]) {
    assert.match(digests[key], /^sha256:[0-9a-f]{64}$/);
  }
});

test("receiptSigningBytes drops the signature field so signature covers everything else", () => {
  const receipt = { a: 1, b: 2, signature: { value: "sig" } };
  const bytes = receiptSigningBytes(receipt);
  assert.equal(bytes.toString("utf8"), '{"a":1,"b":2}');
});

test("all positive fixtures validate against their declared schema", () => {
  const files = fs.readdirSync(path.join(FIXTURES, "positive"));
  const cases = [
    { file: "action.json",                 schema: SCHEMA_ACTION },
    { file: "grant.json",                  schema: SCHEMA_GRANT },
    { file: "decision.json",               schema: SCHEMA_DECISION_V1 },
    { file: "decision-v2.json",            schema: SCHEMA_DECISION },
    { file: "policy.json",                 schema: SCHEMA_POLICY },
    { file: "execution.json",              schema: SCHEMA_EXECUTION },
    { file: "receipt.json",                schema: SCHEMA_RECEIPT },
    { file: "outcome.json",                schema: SCHEMA_OUTCOME },
    { file: "authority-interruption.json", schema: SCHEMA_AUTHORITY_INTERRUPTION },
    { file: "signature.json",              schema: SCHEMA_SIGNATURE },
    { file: "public-key-manifest.json",    schema: SCHEMA_PUBLIC_KEY_MANIFEST },
  ];
  assert.equal(cases.length, files.length, "every fixture must be exercised");
  for (const { file, schema } of cases) {
    const value = readJson(path.join(FIXTURES, "positive", file));
    const result = validate(schema, value);
    assert.equal(result.ok, true, `${file} vs ${schema}: ${JSON.stringify(result.errors)}`);
  }
});

test("adversarial receipt-unknown-field fixture is rejected with additionalProperties", () => {
  const bundle = readJson(path.join(FIXTURES, "adversarial", "receipt-unknown-field.json"));
  const result = validate(SCHEMA_RECEIPT, bundle.receipt);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "additionalProperties"), JSON.stringify(result.errors));
});

test("adversarial receipt-wrong-version fixture is rejected with const", () => {
  const bundle = readJson(path.join(FIXTURES, "adversarial", "receipt-wrong-version.json"));
  const result = validate(SCHEMA_RECEIPT, bundle.receipt);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "const"), JSON.stringify(result.errors));
});

test("adversarial receipt-malformed-digest fixture is rejected with pattern", () => {
  const bundle = readJson(path.join(FIXTURES, "adversarial", "receipt-malformed-digest.json"));
  const result = validate(SCHEMA_RECEIPT, bundle.receipt);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "pattern"), JSON.stringify(result.errors));
});

test("adversarial signature-wrong-algorithm fixture is rejected with const", () => {
  const bundle = readJson(path.join(FIXTURES, "adversarial", "signature-wrong-algorithm.json"));
  const result = validate(SCHEMA_SIGNATURE, bundle.signature);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "const"), JSON.stringify(result.errors));
});

test("adversarial grant-missing-input-hash fixture is rejected with required", () => {
  const bundle = readJson(path.join(FIXTURES, "adversarial", "grant-missing-input-hash.json"));
  const result = validate(SCHEMA_GRANT, bundle.grant);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "required" && e.message.includes("input_hash")), JSON.stringify(result.errors));
});

test("adversarial outcome-unknown-signal fixture is rejected with enum", () => {
  const bundle = readJson(path.join(FIXTURES, "adversarial", "outcome-unknown-signal.json"));
  const result = validate(SCHEMA_OUTCOME, bundle.outcome);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "enum"), JSON.stringify(result.errors));
});

test("adversarial outcome-missing-receipt-id fixture is rejected with required", () => {
  const bundle = readJson(path.join(FIXTURES, "adversarial", "outcome-missing-receipt-id.json"));
  const result = validate(SCHEMA_OUTCOME, bundle.outcome);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "required" && e.message.includes("receipt_id")), JSON.stringify(result.errors));
});

test("validateReceiptChain detects digest mismatches across the chain", () => {
  const action   = { execution_id: "e1", workspace_id: "w1", input_hash: "sha256:aaaa" };
  const grant    = { grant_id: "g1", workspace_id: "w1", input_hash: "sha256:aaaa", target: "t" };
  const decision = { grant_id: "g1", workspace_id: "w1" };
  const policy   = { p: 1 };
  const payload  = { pl: 1 };
  const good = computeReceiptDigests({ action, grant, decision, policy, payload });
  const receipt = { execution_id: "e1", grant_id: "g1", workspace_id: "w1", input_hash: "sha256:aaaa", digests: good };
  action.target = "t";
  const chainOk = { action, grant, decision, policy, payload, receipt };
  chainOk.receipt.digests = computeReceiptDigests(chainOk);
  const okResult = validateReceiptChain(chainOk);
  assert.equal(okResult.ok, true, JSON.stringify(okResult.errors));
  const badReceipt = { ...receipt, digests: { ...good, action: "sha256:0000000000000000000000000000000000000000000000000000000000000000" } };
  const bad = validateReceiptChain({ ...chainOk, receipt: badReceipt });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.keyword === "digest_mismatch" && e.path.endsWith("/action")));
});

test("validateReceiptChain rejects cross-tenant references between action and grant", () => {
  const action   = { execution_id: "e1", workspace_id: "wA", input_hash: "sha256:aaaa" };
  const grant    = { grant_id: "g1", workspace_id: "wB", input_hash: "sha256:aaaa" };
  const decision = { grant_id: "g1", workspace_id: "wB" };
  const policy   = {};
  const payload  = {};
  const digests = computeReceiptDigests({ action, grant, decision, policy, payload });
  const receipt = { execution_id: "e1", grant_id: "g1", workspace_id: "wA", input_hash: "sha256:aaaa", digests };
  const result = validateReceiptChain({ action, grant, decision, policy, payload, receipt });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "cross_object_tenant"), JSON.stringify(result.errors));
});

test("validateReceiptChain rejects grant.input_hash disagreement (signature-domain drift)", () => {
  const action   = { execution_id: "e1", workspace_id: "wA", input_hash: "sha256:aaaa" };
  const grant    = { grant_id: "g1", workspace_id: "wA", input_hash: "sha256:bbbb" };
  const decision = { grant_id: "g1", workspace_id: "wA" };
  const policy   = {};
  const payload  = {};
  const digests = computeReceiptDigests({ action, grant, decision, policy, payload });
  const receipt = { execution_id: "e1", grant_id: "g1", workspace_id: "wA", input_hash: "sha256:aaaa", digests };
  const result = validateReceiptChain({ action, grant, decision, policy, payload, receipt });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.keyword === "input_hash_mismatch"), JSON.stringify(result.errors));
});

test("getSchema resolves by $id and by short filename; allSchemas returns URL-keyed map", () => {
  assert.ok(getSchema("mission-execution-receipt/v2") || getSchema("receipt"));
  const byUrl = getSchema("https://schemas.gomission.io/mission-execution-receipt/v2.json");
  assert.equal(byUrl.title, "Mission Execution Receipt (v2, signed and trace-correlated)");
  const map = allSchemas();
  assert.ok(Object.keys(map).some((k) => k.endsWith("mission-execution-receipt/v2.json")));
});
