// Copyright 2026 Phenomena Labs Ltd
// SPDX-License-Identifier: Apache-2.0
//
// Deterministic canonical JSON for the Trust Graduation protocol.
//
// Rules (a small JCS-compatible subset, sufficient for Mission's shapes):
//   - Objects: keys sorted lexicographically; nested values canonicalized;
//     undefined values are dropped from objects.
//   - Arrays: preserve order; canonicalize each element (undefined -> null).
//   - Strings: JSON.stringify (standard escaping).
//   - Numbers: JSON.stringify (finite only; NaN/Infinity throw).
//   - Booleans: "true" or "false".
//   - null: "null".
//
// These rules are stable and MUST NOT change without a schema version bump,
// because they are the domain over which receipt signatures are computed.

import crypto from "node:crypto";

export function canonicalJson(value) {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical_json_non_finite_number");
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  throw new Error(`canonical_json_unsupported_type:${typeof value}`);
}

/** SHA-256 hex digest over the canonical JSON encoding of value. */
export function digestObject(value) {
  const bytes = Buffer.from(canonicalJson(value), "utf8");
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

/** Compute the five audit-named digests over the sources they attest to. */
export function computeReceiptDigests({ action, grant, decision, policy, payload } = {}) {
  return {
    action:   digestObject(action ?? null),
    grant:    digestObject(grant ?? null),
    decision: digestObject(decision ?? null),
    policy:   digestObject(policy ?? null),
    payload:  digestObject(payload ?? null),
  };
}

/**
 * Return the canonical bytes over which a receipt signature is computed.
 * Removes the `signature` field before serialization so the signature covers
 * every other field exactly once.
 */
export function receiptSigningBytes(receipt) {
  if (!receipt || typeof receipt !== "object") throw new Error("receipt_signing_bytes_requires_object");
  const unsigned = { ...receipt };
  delete unsigned.signature;
  return Buffer.from(canonicalJson(unsigned), "utf8");
}
