# Stagehand Provider Gate

Status: experimental `@trust-graduation/core@0.2.0-beta.4` candidate; not
published and not included in `@trust-graduation/core@0.2.0-beta.2`

This adapter governs one deterministic Browserbase Stagehand action immediately
before `stagehand.act(Action)`. It does not treat a browser click as proof that
the intended application or provider effect occurred.

The integration therefore binds two things together:

1. the exact Stagehand `Action`, page URL, page ID, and browser session;
2. the application-specific target and full payload that action is intended to
   submit.

After Stagehand reports the exact performed action, an application-owned
`confirmEffect` callback must query the downstream source of truth and return a
provider event ID plus evidence for the same target and payload hash. Missing or
mismatched confirmation becomes `provider_outcome_unknown`; the consumed grant
cannot be replayed.

## Current Stagehand seam

This adapter was checked against Browserbase Stagehand `4.0.1`, repository
commit `0af36da900cf669b6d18a0a144ee119789f8f7de` dated 2026-08-14.
Stagehand's string, cached, and self-heal paths converge on
`takeDeterministicAction()` and then `performUnderstudyMethod()` in
`packages/extension/services/actService.ts`. The public SDK also accepts the
deterministic `stagehand.act(Action)` overload.

Mission uses only that object overload. Natural-language instructions and
unresolved `%variables%` are rejected because the final selector, method, and
arguments would not yet be the exact action reviewed by the principal.

### Stagehand 4.0.1 local-browser initialization

Stagehand `4.0.1` checks for a configured model or Browserbase Model Gateway
before dispatching every `act()` call, including the deterministic object
overload. A Browserbase session with managed inference or an ordinary configured
model satisfies that controller precondition.

For a credential-free local-browser proof, supply a client-model sentinel that
fails if inference is ever requested:

```js
let llmCalls = 0;
const stagehand = await Stagehand.create({
  browser,
  selfHeal: false,
  model: {
    async generate() {
      llmCalls += 1;
      throw new Error("inference is disabled for this governed deterministic action");
    }
  }
});
```

After the governed action, assert `llmCalls === 0`. This satisfies Stagehand's
initialization check without turning the final action back into an inferred
instruction. If the callback is invoked, fail the run and treat the consumed
grant as an unknown outcome.

Local Stagehand browsers do not expose a Browserbase `sessionId`; a local-only
test host must bind its own stable logical session identifier in
`createStagehandProviderAction()` and return the same value from
`getPageContext()`. Production Browserbase integrations should bind the actual
`stagehand.browser.sessionId`.

The package includes a credential-free loopback proof that drives an actual
local Chrome through Stagehand, confirms one application-owned server event,
and verifies mutation, racing-duplicate, and replay denial:

```bash
npx -y \
  --package @trust-graduation/core@beta \
  --package @browserbasehq/stagehand@4.0.1 \
  trust-graduation stagehand-demo
```

It requires Node.js `22.18.0` or newer (Stagehand's requirement) and a local
Chrome installation. The example uses the process-local grant store and a
loopback application solely as an executable protocol proof; it is not a
production store, external adoption, or a Browserbase session.

## Integration shape

First observe and select the final action without executing it:

```js
const { data: candidates } = await stagehand.observe(
  "find the final order submit button"
);
const selected = candidates[0];
if (!selected?.method) throw new Error("observed Action has no deterministic method");
const exactAction = {
  selector: selected.selector,
  description: selected.description,
  method: selected.method,
  arguments: selected.arguments ?? []
};
const page = await stagehand.browser.context.activePage();
const sessionId = stagehand.browser.sessionId;
if (!page || !sessionId) throw new Error("a Browserbase page and session are required");

const requested = createStagehandProviderAction({
  actionClass: "browser.order.submit.external",
  workspace: "workspace-123",
  principal: "principal-123",
  requestedBy: "checkout-agent",
  tenant: "tenant-123",
  stagehandAction: exactAction,
  pageUrl: await page.url(),
  pageId: page.pageId,
  sessionId,
  effect: {
    target: "orders/order-42/submit",
    payload: { orderId: "order-42", quantity: 2 },
    expectedEvidence: { eventType: "order.submitted" }
  },
  constraints: { environment: "staging" }
});
```

Then compose Stagehand with the ordinary atomic grant store, issuer
authentication, and receipt sink:

```js
const gate = createStagehandProviderGate({
  stagehand,
  store: sharedAtomicGrantStore,
  authenticateGrant: verifyPrincipalSignature,
  writeReceipt: appendDurableReceipt,
  getPageContext: async () => {
    const livePage = await stagehand.browser.context.activePage();
    return {
      url: await livePage.url(),
      pageId: livePage.pageId,
      sessionId: stagehand.browser.sessionId,
      page: livePage
    };
  },
  confirmEffect: async ({ expected }) => {
    const event = await lookupOrderEvent(expected.payload.orderId);
    return {
      ok: event?.type === "order.submitted",
      providerEventId: event?.id,
      target: expected.target,
      payloadHash: expected.payloadHash,
      evidence: event && {
        eventType: event.type,
        orderId: event.orderId,
        acceptedAt: event.acceptedAt
      }
    };
  }
});

const binding = gate.prepare(requested);
// Present binding plus the exact action/effect preview, authenticate the issuer,
// and mint a createApprovalGrant(...) grant for this binding.
const result = await gate.execute({ binding, approval, action: requested });
```

`sharedAtomicGrantStore` in the explanatory snippet is the value passed as
`store`; it is shown by name to emphasize that production must not use the
process-local demo store.

## What a confirmation must mean

`confirmEffect` is part of the trust boundary. It must read the application or
provider's authoritative event, API response, staging database record, webhook,
or equivalent result. A Stagehand `ActResult`, DOM text, screenshot, or session
replay is useful context but is not independent confirmation of the business
effect.

The callback must return:

- `ok: true`;
- a non-empty, provider-owned `providerEventId`;
- the exact expected target;
- the exact expected payload hash supplied by the adapter;
- JSON evidence safe to hash and retain.

If any field is absent or differs, the Gate records an unknown outcome. The
adapter never claims durable exactly-once execution.

## Host invariants

The package can protect the wrapper but cannot remove a bypass elsewhere in the
host. A strict integration must:

- make the Gate the only code path with access to the consequential
  `stagehand.act` call;
- prevent direct/raw `stagehand.act` calls for that action class;
- serialize the selected page while authority is pending;
- keep Stagehand domain policy enabled as a complementary origin allowlist;
- disable or detect self-heal for the final consequential action; this adapter
  rejects any performed selector, method, description, or argument that differs
  from the approved Action;
- reconcile unknown outcomes before proposing another attempt.

If the downstream effect cannot be isolated and confirmed, the integration is
advisory browser supervision, not a Mission Gate.
