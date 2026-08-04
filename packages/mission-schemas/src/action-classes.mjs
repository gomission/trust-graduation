// Copyright 2026 Phenomena Labs Ltd
// SPDX-License-Identifier: Apache-2.0
//
// Canonical action-class vocabulary for the Trust Graduation protocol.
//
// The action class is the primary axis on which autonomy is earned. Trust
// graduates class-by-class, not globally. The taxonomy below is stable and
// additive: new classes may be added, existing classes may not be renamed or
// merged silently.

export const ACTION_CLASSES = Object.freeze({
  // Read-only actions. No external side effect. Safe under supervised autonomy.
  "browser.research.read":     { risk_class: "read_only",            external_side_effects: "none" },
  "agent.plan.prepare":        { risk_class: "plan_only",            external_side_effects: "none" },

  // Local-only mutations. No external effect. Safe to perform locally with
  // approval evidence, but reversible only within Mission's local state.
  "gmail.draft.create":        { risk_class: "reversible_write",     external_side_effects: "draft_only" },
  "mission.task.update.local": { risk_class: "local_state_move",     external_side_effects: "local_only" },

  // External consequence. Requires explicit human approval per grant, always.
  // The paused-run-resumes-once pattern is mandatory.
  "email.send.external":       { risk_class: "external_consequence", external_side_effects: "email_send" },
});

/** Return the specification for an action class, or null if unknown. */
export function actionClassSpec(name) {
  return ACTION_CLASSES[name] || null;
}

/** True if the name is a canonical action class known to this package. */
export function isKnownActionClass(name) {
  return Object.prototype.hasOwnProperty.call(ACTION_CLASSES, name);
}

/** Ordered list of all canonical action class names. */
export function listActionClasses() {
  return Object.keys(ACTION_CLASSES);
}
