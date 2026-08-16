# A2A Exact Action Authorization Extension v1

Status: experimental implementation draft

Updated: 2026-08-16

Extension URI:

`https://trustgraduation.org/extensions/a2a/action-authorization/v1`

## Purpose

A2A v1 defines `TASK_STATE_AUTH_REQUIRED` as an interrupted state, but deliberately does not define the scope, representation, validity, or revocation semantics of the authorization obtained in response. The state transition alone is not authority.

This extension fills that narrow gap. It lets an A2A agent pause before a consequential effect, expose the exact effect for review, receive a single-use action-bound grant, validate it immediately before execution, and return receipt evidence afterward.

It does not replace A2A authentication, OAuth, agent identity, tool policy, physical safety systems, or provider authorization. It defines the continuation contract after identity and policy have established who may decide.

## Activation

An agent declares support in its Agent Card:

```json
{
  "capabilities": {
    "extensions": [
      {
        "uri": "https://trustgraduation.org/extensions/a2a/action-authorization/v1",
        "description": "Exact action-bound authorization with single-use grants and execution receipts.",
        "required": false,
        "params": {
          "version": "1.0",
          "taskState": "TASK_STATE_AUTH_REQUIRED",
          "authorizationMediaType": "application/vnd.trustgraduation.authorization+json;version=1",
          "receiptMediaType": "application/vnd.trustgraduation.execution-receipt+json;version=1"
        }
      }
    ]
  }
}
```

The client requests activation using the A2A binding's normal mechanism. For HTTP:

```http
A2A-Extensions: https://trustgraduation.org/extensions/a2a/action-authorization/v1
```

An extension-aware response should echo the activated extension URI.

## Exact action binding

Before requesting authorization, the agent constructs an `ActionBinding`:

```json
{
  "protocol": "trust-graduation-action-binding",
  "version": "1.0",
  "actionClass": "email.send.external",
  "workspace": "workspace-1",
  "principal": "principal-1",
  "requestedBy": "mail-agent",
  "tenant": "tenant-1",
  "target": "buyer@example.com",
  "inputHash": "sha256:...",
  "constraints": { "scope": "once" },
  "expiresAt": "2026-08-16T12:05:00.000Z",
  "nonce": "nonce-1",
  "actionHash": "sha256:..."
}
```

`inputHash` is SHA-256 over the canonical JSON encoding of the complete provider input. `actionHash` is SHA-256 over the canonical JSON encoding of every binding field except `actionHash` itself.

Canonicalization rules for v1:

- sort object keys lexicographically;
- preserve array order;
- omit undefined object values and encode undefined array values as `null`;
- use JSON string escaping and finite JSON numbers only;
- reject unsupported values rather than coercing them.

The schemas are:

- `schemas/extensions/a2a/action-authorization/v1/action-binding.schema.json`
- `schemas/extensions/a2a/action-authorization/v1/approval-grant.schema.json`

## Authorization request

The agent transitions its Task to `TASK_STATE_AUTH_REQUIRED`. Its status Message:

- includes the extension URI in `extensions`;
- places an `authorization_request` payload under the extension URI in `metadata`;
- includes the same payload as a structured `Part` using the extension authorization media type;
- identifies the decision, approval packet, action binding, risk class, explanation, and available human decisions.

Critical authorization data must also remain retrievable from Task state or an authenticated authorization service. A transient Message alone is not a durable security record.

## Approval grant

An approval is valid only when it is bound to the exact `actionHash` and repeats the security-relevant identity fields:

```json
{
  "protocol": "trust-graduation-authorization",
  "version": "1.0",
  "state": "approved",
  "grantId": "grant-1",
  "issuer": "principal:principal-1",
  "principal": "principal-1",
  "requestedBy": "mail-agent",
  "workspace": "workspace-1",
  "tenant": "tenant-1",
  "actionClass": "email.send.external",
  "target": "buyer@example.com",
  "inputHash": "sha256:...",
  "actionHash": "sha256:...",
  "nonce": "nonce-1",
  "scope": "once",
  "maxExecutions": 1,
  "executionCount": 0,
  "issuedAt": "2026-08-16T12:00:00.000Z",
  "expiresAt": "2026-08-16T12:05:00.000Z",
  "revocable": true
}
```

The decision may arrive through an authenticated out-of-band service or an A2A user Message carrying the activated extension. Transporting a grant through A2A does not make it authentic by itself. Implementations must authenticate the issuer or verify a signature before accepting it.

## Required enforcement behavior

Immediately before the external effect, the executor must verify:

1. the binding and grant use the recognized protocol and version, and the grant state is `approved`;
2. `actionHash`, `inputHash`, action class, target, principal, requesting agent, workspace, tenant, and nonce match the pending effect;
3. scope is `once` and `maxExecutions` is exactly `1`;
4. the grant has not expired, been revoked, or already been consumed;
5. the issuer is authorized to approve for this principal and action class.

Pure validation only establishes that a grant is eligible for consumption; it is not execution authority. The executor must atomically consume the grant before invoking the provider. A second executor racing with the same unchanged grant must lose. A provider timeout after invocation must become `outcome_unknown`, not an automatic retry under the same grant.

The reference store contract is one `consume()` compare-and-set keyed by at
least issuer, tenant, and grant ID. In the same transaction it checks durable
revocation state and inserts the identity only if it is still live and unused;
it returns a revoked/consumed failure otherwise and throws on storage failure.
The operation must be shared across every executor. An in-memory set is
conformant only for a single-process demo, never for production or horizontally
scaled workers.

Any changed target or input creates a new action hash and requires a new authorization decision.

## Receipt

After a provider confirms completion, the agent attaches an execution receipt as an A2A Task Artifact using:

`application/vnd.trustgraduation.execution-receipt+json;version=1`

The receipt should bind the action, grant, policy, provider payload/result, tenant, trace context, completion time, and signing identity. Mission Gate's signed receipt v2 is the current reference profile; it is not required branding for another implementation.

Preparation, approval, queueing, or a provider timeout is not a completed execution receipt.

## Failure behavior

- Missing extension support: remain in the baseline A2A authorization flow or reject if the Agent Card marked the extension required.
- Missing action hash: remain `TASK_STATE_AUTH_REQUIRED`.
- Mutation, expiry, revocation, replay, identity mismatch, or ambiguous result: fail closed.
- Rejection: transition to `TASK_STATE_REJECTED` or continue negotiation according to the task contract; never reinterpret rejection as narrower approval.
- Revision: create a new binding and authorization request.

## Reference package

```js
import {
  TrustGraduation,
  consumeApprovalGrant,
  createApprovalGrant,
  createMemoryGrantStore,
  toA2AAuthorizationTask
} from "@trust-graduation/core";
```

Run `npm run example:a2a` in this repository for a complete no-network continuation.

`createMemoryGrantStore()` is used by that example so it stays zero-config. A
real executor supplies a shared transactional or unique-insert store and calls
`consumeApprovalGrant()` immediately before its provider boundary.

## Conformance target

The draft remains experimental until at least two independent implementations complete the same fixtures. A conforming implementation must demonstrate successful exact execution and rejection of unbound approval, input/target mutation, expiry, revocation, tenant/agent mismatch, unchanged-grant replay, and a simultaneous two-consumer race.

After outside validation, the intended route is an upstream A2A experimental-extension proposal rather than permanent vendor ownership of the namespace.
