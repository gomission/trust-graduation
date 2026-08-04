// Copyright 2026 Phenomena Labs Ltd
// SPDX-License-Identifier: Apache-2.0
//
// Single source of truth for Mission protocol schema identifiers.
// Every emitted object in the Trust Graduation protocol carries one of these
// strings in its `schema` field. Version bumps are additive-only: the previous
// version continues to be valid forever, and the new version must be introduced
// only after a compatibility slice that emits both shapes.

export const SCHEMA_ACTION                    = "mission-action/v1";
export const SCHEMA_GRANT                     = "mission-grant/v1";
export const SCHEMA_DECISION_V1               = "mission-decision/v1";
export const SCHEMA_DECISION                  = "mission-decision/v2";
export const SCHEMA_POLICY                    = "mission-capability-policy/v1";
export const SCHEMA_EXECUTION                 = "mission-desktop-execution/v1";
export const SCHEMA_RECEIPT_V1                = "mission-execution-receipt/v1";
export const SCHEMA_RECEIPT                   = "mission-execution-receipt/v2";
export const SCHEMA_OUTCOME                   = "mission-outcome/v1";
export const SCHEMA_AUTHORITY_INTERRUPTION    = "mission-authority-interruption/v1";
export const SCHEMA_SIGNATURE                 = "mission-receipt-signature/v1";
export const SCHEMA_PUBLIC_KEY_MANIFEST       = "mission-public-key-manifest/v1";
export const SCHEMA_HORIZON_PROMPT            = "mission-horizon-prompt/v1";

// Cryptographic constants used across the receipt-signing surface.
export const RECEIPT_SIGNING_ALGORITHM        = "ed25519";
export const RECEIPT_SIGNING_VERSION          = "v1";

// The canonical current receipt version, used as a stable pointer by consumers
// that want "latest signed trace-correlated receipt shape" without hardcoding.
export const CURRENT_RECEIPT_SCHEMA           = SCHEMA_RECEIPT;
export const CURRENT_DECISION_SCHEMA          = SCHEMA_DECISION;

// Every schema identifier known to this package, in stable order. Consumers
// should never construct schema strings from parts; only reference constants.
export const ALL_SCHEMAS = Object.freeze([
  SCHEMA_ACTION,
  SCHEMA_GRANT,
  SCHEMA_DECISION_V1,
  SCHEMA_DECISION,
  SCHEMA_POLICY,
  SCHEMA_EXECUTION,
  SCHEMA_RECEIPT_V1,
  SCHEMA_RECEIPT,
  SCHEMA_OUTCOME,
  SCHEMA_AUTHORITY_INTERRUPTION,
  SCHEMA_SIGNATURE,
  SCHEMA_PUBLIC_KEY_MANIFEST,
  SCHEMA_HORIZON_PROMPT,
]);
