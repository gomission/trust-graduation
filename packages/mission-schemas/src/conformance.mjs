// Copyright 2026 Phenomena Labs Ltd
// SPDX-License-Identifier: Apache-2.0
//
// Cross-object conformance checks. The single-schema validator answers "is this
// shape correct?" but the receipt chain also has to answer:
//
//   - Does the receipt's action digest match the recomputed action digest?
//   - Does the receipt's grant digest match the recomputed grant digest?
//   - Does the receipt's decision digest match the recomputed decision digest?
//   - Does the receipt's policy digest match the recomputed policy digest?
//   - Does the receipt's payload digest match the recomputed payload digest?
//   - Do execution/grant/decision references share the same workspace and grant ids?
//   - Does the raw payload match every declared exact-input commitment?
// Signature verification and live key selection are host responsibilities.
//
// This module answers those questions with pure functions, no I/O.

import { computeReceiptDigests } from "./canonicalization.mjs";
import { validate } from "./validator.mjs";

/**
 * @typedef {Object} ReceiptChain
 * @property {Object} action    Action envelope emitted at execution time.
 * @property {Object} grant     Grant that authorized execution.
 * @property {Object} decision  Decision that approved the grant to run.
 * @property {Object} policy    Capability policy at execution time.
 * @property {any} payload      Raw tool input (any JSON shape).
 * @property {Object} receipt   Signed receipt emitted at completion.
 */

/**
 * Validate cross-object references in a receipt chain.
 * Does not validate signatures (use verifyReceipt for that). Only checks that
 * the receipt's digests match the sources it claims to attest, and that
 * identifiers line up.
 *
 * @param {ReceiptChain} chain
 * @returns {{ok: boolean, errors: [{path, keyword, message}]}}
 */
export function validateReceiptChain(chain = {}) {
  const errors = [];
  const { action, grant, decision, policy, payload, receipt } = chain;
  if (!receipt) return { ok: false, errors: [{ path: "/receipt", keyword: "required", message: "receipt is required" }] };
  // Missing payload is different from an explicitly approved JSON null.
  if (!Object.prototype.hasOwnProperty.call(chain, "payload") || payload === undefined) {
    errors.push({ path: "/payload", keyword: "required", message: "exact raw input payload is required" });
  }
  const recomputed = computeReceiptDigests({ action, grant, decision, policy, payload });
  for (const [name, source] of [["action", action], ["grant", grant], ["receipt", receipt]]) {
    if (!source || source.input_hash !== recomputed.payload) {
      errors.push({ path: `/${name}/input_hash`, keyword: "payload_commitment_mismatch", message: `${name}.input_hash does not match the exact raw input payload` });
    }
  }
  // Decision v1 has no input commitment; v2 and any supplied commitment must agree.
  if (decision && (decision.schema === "mission-decision/v2" || Object.prototype.hasOwnProperty.call(decision, "input_hash")) && decision.input_hash !== recomputed.payload) {
    errors.push({ path: "/decision/input_hash", keyword: "payload_commitment_mismatch", message: "decision.input_hash does not match the exact raw input payload" });
  }
  for (const key of ["action", "grant", "decision", "policy", "payload"]) {
    if (recomputed[key] !== receipt.digests?.[key]) {
      errors.push({ path: `/receipt/digests/${key}`, keyword: "digest_mismatch", message: `receipt.digests.${key} does not match recomputed digest from source` });
    }
  }
  if (action && grant && action.workspace_id !== grant.workspace_id) {
    errors.push({ path: "/grant/workspace_id", keyword: "cross_object_tenant", message: "action.workspace_id and grant.workspace_id disagree" });
  }
  if (grant && decision && grant.workspace_id !== decision.workspace_id) {
    errors.push({ path: "/decision/workspace_id", keyword: "cross_object_tenant", message: "grant.workspace_id and decision.workspace_id disagree" });
  }
  if (grant && decision && grant.grant_id !== decision.grant_id) {
    errors.push({ path: "/decision/grant_id", keyword: "cross_object_reference", message: "decision.grant_id does not match grant.grant_id" });
  }
  if (action && receipt.execution_id && action.execution_id !== receipt.execution_id) {
    errors.push({ path: "/receipt/execution_id", keyword: "cross_object_reference", message: "receipt.execution_id does not match action.execution_id" });
  }
  if (grant && receipt.grant_id && grant.grant_id !== receipt.grant_id) {
    errors.push({ path: "/receipt/grant_id", keyword: "cross_object_reference", message: "receipt.grant_id does not match grant.grant_id" });
  }
  if (receipt.workspace_id && action?.workspace_id && receipt.workspace_id !== action.workspace_id) {
    errors.push({ path: "/receipt/workspace_id", keyword: "cross_object_tenant", message: "receipt.workspace_id does not match action.workspace_id" });
  }
  if (grant && grant.input_hash && action?.input_hash && grant.input_hash !== action.input_hash) {
    errors.push({ path: "/grant/input_hash", keyword: "input_hash_mismatch", message: "grant.input_hash does not match action.input_hash" });
  }
  if (grant && receipt.input_hash && grant.input_hash !== receipt.input_hash) {
    errors.push({ path: "/receipt/input_hash", keyword: "input_hash_mismatch", message: "receipt.input_hash does not match grant.input_hash" });
  }
  if (grant && action?.target && grant.target && grant.target !== action.target) {
    errors.push({ path: "/grant/target", keyword: "target_mismatch", message: "grant.target does not match action.target" });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Run the single-schema validator against each object in a chain (or single
 * object) plus optional cross-reference checks. Returns a structured report.
 */
export function conform({ target, schema, chain } = {}) {
  const report = {
    ok: true,
    errors: [],
    warnings: [],
    checks: [],
  };
  if (schema && target) {
    const result = validate(schema, target);
    report.checks.push({ name: `schema:${schema}`, ok: result.ok, errors: result.errors });
    if (!result.ok) { report.ok = false; report.errors.push(...result.errors.map((e) => ({ ...e, check: `schema:${schema}` }))); }
  }
  if (chain) {
    const result = validateReceiptChain(chain);
    report.checks.push({ name: "cross_object_references", ok: result.ok, errors: result.errors });
    if (!result.ok) { report.ok = false; report.errors.push(...result.errors.map((e) => ({ ...e, check: "cross_object_references" }))); }
  }
  return report;
}
