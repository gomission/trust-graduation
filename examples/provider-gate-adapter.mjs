import { createProviderGate } from "@trust-graduation/core";

/**
 * Adapter contract used by `trust-graduation conformance`.
 *
 * Keep the injected dependencies and provider input unchanged: the conformance
 * runner proves that the exact canonical object committed before approval is
 * the object delivered to the provider. Normalize SDK arguments before
 * gate.prepare(), never between authorization and the provider call.
 */
export function createGate(dependencies) {
  return createProviderGate(dependencies);
}
