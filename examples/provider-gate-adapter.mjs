import { createProviderGate } from "@trust-graduation/core";

/**
 * Adapter contract used by `trust-graduation conformance`.
 *
 * Keep the injected dependencies: the conformance runner uses them to prove
 * that no provider call can bypass the gate. In your application, compose this
 * factory with the real provider function, durable atomic store, authenticated
 * approval verifier, and durable receipt sink.
 */
export function createGate({ provider, ...dependencies }) {
  return createProviderGate({
    ...dependencies,
    provider: async (input, context) => provider(mapProviderInput(input), context)
  });
}

/** Replace this identity mapping with the arguments your provider expects. */
function mapProviderInput(input) {
  return input;
}
