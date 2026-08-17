import { digestObject } from "./action-binding.js";
import { createProviderGate } from "./provider-gate.js";

const PROTOCOL = "trust-graduation-stagehand-provider-action";
const VERSION = "0.1";

/**
 * Bind one deterministic Stagehand Action to the downstream effect that the
 * browser interaction is intended to cause.
 *
 * Natural-language act instructions are deliberately rejected. Integrators
 * should call Stagehand observe(), select one Action, resolve every variable,
 * and present this returned provider action for exact approval.
 */
export function createStagehandProviderAction({
  actionClass,
  workspace = "",
  principal = "",
  requestedBy = "stagehand-agent",
  tenant = "",
  stagehandAction,
  pageUrl,
  pageId,
  sessionId,
  effect,
  constraints = {},
  expiresAt = "",
  nonce = ""
} = {}) {
  const deterministicAction = normalizeDeterministicAction(stagehandAction);
  const page = normalizeBoundPage({ pageUrl, pageId, sessionId });
  const normalizedEffect = normalizeEffect(effect);
  const normalizedConstraints = cloneJsonObject(constraints, "constraints");

  return deepFreeze({
    actionClass: requiredString(actionClass, "actionClass"),
    workspace: String(workspace || ""),
    principal: requiredString(principal || workspace, "principal or workspace"),
    requestedBy: requiredString(requestedBy, "requestedBy"),
    tenant: String(tenant || ""),
    target: normalizedEffect.target,
    input: {
      protocol: PROTOCOL,
      version: VERSION,
      stagehandAction: deterministicAction,
      page,
      effect: normalizedEffect
    },
    constraints: {
      ...normalizedConstraints,
      deterministicStagehandActionRequired: true,
      downstreamEffectConfirmationRequired: true,
      rawStagehandBypassProhibited: true
    },
    ...(expiresAt ? { expiresAt: String(expiresAt) } : {}),
    ...(nonce ? { nonce: String(nonce) } : {})
  });
}

/**
 * Compose the generic provider Gate around Stagehand's deterministic act()
 * overload and an application-owned downstream confirmation callback.
 *
 * The confirmation callback is mandatory because a successful DOM operation
 * does not prove that the intended application/provider effect occurred.
 */
export function createStagehandProviderGate({
  stagehand,
  getPageContext,
  confirmEffect,
  store,
  authenticateGrant,
  writeReceipt,
  now,
  createId,
  grantLifetimeMs
} = {}) {
  requireFunction(stagehand?.act, "stagehand.act");
  requireFunction(getPageContext, "getPageContext");
  requireFunction(confirmEffect, "confirmEffect");

  const gate = createProviderGate({
    store,
    authenticateGrant,
    writeReceipt,
    ...(now !== undefined ? { now } : {}),
    ...(createId !== undefined ? { createId } : {}),
    ...(grantLifetimeMs !== undefined ? { grantLifetimeMs } : {}),
    provider: async (input, context) => {
      const action = snapshotProviderAction(context.action);
      assertProviderInputMatchesAction(action);

      const livePage = await readPageContext(getPageContext, context);
      assertPageContextMatches(action.input.page, livePage);

      const stagehandResult = livePage.page
        ? await stagehand.act(action.input.stagehandAction, { page: livePage.page })
        : await stagehand.act(action.input.stagehandAction);
      const performed = requireExactStagehandResult(
        stagehandResult,
        action.input.stagehandAction
      );

      const expected = deepFreeze({
        target: action.input.effect.target,
        payload: action.input.effect.payload,
        payloadHash: action.input.effect.payloadHash,
        ...(Object.prototype.hasOwnProperty.call(action.input.effect, "expectedEvidence")
          ? { expectedEvidence: action.input.effect.expectedEvidence }
          : {})
      });
      const confirmation = await confirmEffect(Object.freeze({
        expected,
        action: action.input.stagehandAction,
        page: Object.freeze({
          url: livePage.url,
          origin: livePage.origin,
          pageId: livePage.pageId,
          sessionId: livePage.sessionId
        }),
        stagehandResult,
        context
      }));
      const confirmed = normalizeConfirmation(confirmation, expected);

      return deepFreeze({
        providerEventId: confirmed.providerEventId,
        target: confirmed.target,
        payloadHash: confirmed.payloadHash,
        evidence: confirmed.evidence,
        sessionId: livePage.sessionId,
        pageId: livePage.pageId,
        stagehandActionHash: digestObject(action.input.stagehandAction),
        stagehand: {
          success: true,
          message: performed.message,
          actionCount: performed.actions.length
        }
      });
    },
    resultEvidence: (result) => ({
      providerEventId: result.providerEventId,
      target: result.target,
      payloadHash: result.payloadHash,
      evidence: result.evidence,
      sessionId: result.sessionId,
      pageId: result.pageId,
      stagehandActionHash: result.stagehandActionHash,
      stagehand: result.stagehand
    })
  });

  return Object.freeze({
    prepare(action) {
      return gate.prepare(snapshotProviderAction(action));
    },
    execute({ binding, approval, action } = {}) {
      let snapshot;
      try {
        snapshot = snapshotProviderAction(action);
      } catch (error) {
        return Promise.resolve({
          ok: false,
          reason: errorCode(error, "stagehand_provider_action_invalid"),
          providerCalled: false,
          outcomeUnknown: false
        });
      }
      return gate.execute({ binding, approval, action: snapshot });
    }
  });
}

function snapshotProviderAction(action) {
  if (!isPlainObject(action)) {
    throw codedTypeError("stagehand_provider_action_invalid", "action must be an object");
  }
  if (!isPlainObject(action.input)) {
    throw codedTypeError("stagehand_provider_input_invalid", "action.input must be an object");
  }
  if (action.input.protocol !== PROTOCOL || action.input.version !== VERSION) {
    throw codedTypeError(
      "stagehand_provider_protocol_invalid",
      `action.input must use ${PROTOCOL} ${VERSION}`
    );
  }

  const rebuilt = createStagehandProviderAction({
    actionClass: action.actionClass,
    workspace: action.workspace,
    principal: action.principal,
    requestedBy: action.requestedBy,
    tenant: action.tenant,
    stagehandAction: action.input.stagehandAction,
    pageUrl: action.input.page?.url,
    pageId: action.input.page?.pageId,
    sessionId: action.input.page?.sessionId,
    effect: action.input.effect,
    constraints: action.constraints,
    expiresAt: action.expiresAt,
    nonce: action.nonce
  });
  assertProviderInputMatchesAction(rebuilt);
  return rebuilt;
}

function assertProviderInputMatchesAction(action) {
  if (action.target !== action.input.effect.target) {
    throw codedTypeError(
      "stagehand_effect_target_mismatch",
      "action.target must match action.input.effect.target"
    );
  }
  if (action.input.effect.payloadHash !== digestObject(action.input.effect.payload)) {
    throw codedTypeError(
      "stagehand_effect_payload_hash_mismatch",
      "effect.payloadHash must match the exact effect payload"
    );
  }
  for (const key of [
    "deterministicStagehandActionRequired",
    "downstreamEffectConfirmationRequired",
    "rawStagehandBypassProhibited"
  ]) {
    if (action.constraints?.[key] !== true) {
      throw codedTypeError(
        "stagehand_gate_constraint_missing",
        `action.constraints.${key} must be true`
      );
    }
  }
}

async function readPageContext(getPageContext, context) {
  let value;
  try {
    value = await getPageContext(Object.freeze({
      action: context.action,
      binding: context.binding
    }));
  } catch (error) {
    throw namedError(
      "StagehandPageContextUnavailableError",
      "stagehand page context could not be read",
      error
    );
  }
  if (!isPlainObject(value)) {
    throw namedError(
      "StagehandPageContextUnavailableError",
      "getPageContext must return an object"
    );
  }

  let page;
  try {
    page = normalizeBoundPage({
      pageUrl: value.url,
      pageId: value.pageId,
      sessionId: value.sessionId
    });
  } catch (error) {
    throw namedError(
      "StagehandPageContextUnavailableError",
      "getPageContext returned an invalid page URL, page ID, or session ID",
      error
    );
  }
  if (
    value.page &&
    (typeof value.page.pageId !== "string" || value.page.pageId.trim() !== page.pageId)
  ) {
    throw namedError(
      "StagehandPageContextMismatchError",
      "the supplied Stagehand Page object does not match getPageContext.pageId"
    );
  }
  return { ...page, ...(value.page ? { page: value.page } : {}) };
}

function assertPageContextMatches(expected, actual) {
  if (
    expected.url !== actual.url ||
    expected.origin !== actual.origin ||
    expected.pageId !== actual.pageId ||
    expected.sessionId !== actual.sessionId
  ) {
    throw namedError(
      "StagehandPageContextMismatchError",
      "the live Stagehand page, tab, or session differs from the approved binding"
    );
  }
}

function requireExactStagehandResult(result, expectedAction) {
  const data = isPlainObject(result?.data) ? result.data : result;
  if (!isPlainObject(data) || data.success !== true) {
    throw namedError(
      "StagehandActionUnconfirmedError",
      "Stagehand did not confirm deterministic action success"
    );
  }
  if (!Array.isArray(data.actions) || data.actions.length !== 1) {
    throw namedError(
      "StagehandActionResultMismatchError",
      "Stagehand must report exactly one performed deterministic action"
    );
  }

  let performedAction;
  try {
    performedAction = normalizeDeterministicAction(data.actions[0]);
  } catch (error) {
    throw namedError(
      "StagehandActionResultMismatchError",
      "Stagehand returned an invalid performed action",
      error
    );
  }
  if (digestObject(performedAction) !== digestObject(expectedAction)) {
    throw namedError(
      "StagehandActionResultMismatchError",
      "Stagehand performed action differs from the approved deterministic action"
    );
  }
  return {
    success: true,
    message: typeof data.message === "string" ? data.message : "",
    actions: [performedAction]
  };
}

function normalizeConfirmation(confirmation, expected) {
  if (!isPlainObject(confirmation) || confirmation.ok !== true) {
    throw namedError(
      "StagehandEffectConfirmationError",
      "downstream effect was not confirmed"
    );
  }
  const providerEventId = requiredString(
    confirmation.providerEventId,
    "confirmation.providerEventId",
    "StagehandEffectConfirmationError"
  );
  const target = requiredString(
    confirmation.target,
    "confirmation.target",
    "StagehandEffectConfirmationError"
  );
  const payloadHash = requiredString(
    confirmation.payloadHash,
    "confirmation.payloadHash",
    "StagehandEffectConfirmationError"
  );
  if (target !== expected.target || payloadHash !== expected.payloadHash) {
    throw namedError(
      "StagehandEffectConfirmationMismatchError",
      "downstream confirmation does not match the approved target and payload"
    );
  }
  if (!Object.prototype.hasOwnProperty.call(confirmation, "evidence")) {
    throw namedError(
      "StagehandEffectConfirmationError",
      "confirmation.evidence is required"
    );
  }
  return {
    providerEventId,
    target,
    payloadHash,
    evidence: cloneJsonValue(confirmation.evidence, "confirmation.evidence")
  };
}

function normalizeDeterministicAction(action) {
  if (typeof action === "string") {
    throw codedTypeError(
      "stagehand_natural_language_action_rejected",
      "natural-language Stagehand actions are not exact authority; use an observed Action object"
    );
  }
  if (!isPlainObject(action)) {
    throw codedTypeError("stagehand_action_invalid", "stagehandAction must be an object");
  }
  const selector = requiredString(action.selector, "stagehandAction.selector");
  const description = requiredString(action.description, "stagehandAction.description");
  const method = requiredString(action.method, "stagehandAction.method");
  if (method === "not-supported") {
    throw codedTypeError(
      "stagehand_action_method_unsupported",
      "stagehandAction.method cannot be not-supported"
    );
  }
  if (!Array.isArray(action.arguments) || action.arguments.some((value) => typeof value !== "string")) {
    throw codedTypeError(
      "stagehand_action_arguments_invalid",
      "stagehandAction.arguments must be an array of resolved strings"
    );
  }
  if (action.arguments.some((value) => /%[A-Za-z_][A-Za-z0-9_]*%/.test(value))) {
    throw codedTypeError(
      "stagehand_action_variables_unresolved",
      "resolve Stagehand %variables% before requesting authority"
    );
  }
  return { selector, description, method, arguments: [...action.arguments] };
}

function normalizeBoundPage({ pageUrl, pageId, sessionId } = {}) {
  let parsed;
  try {
    parsed = new URL(requiredString(pageUrl, "pageUrl"));
  } catch (error) {
    if (error?.code) throw error;
    throw codedTypeError("stagehand_page_url_invalid", "pageUrl must be a valid URL");
  }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw codedTypeError(
      "stagehand_page_url_invalid",
      "pageUrl must be an HTTP(S) URL without embedded credentials"
    );
  }
  return {
    url: parsed.href,
    origin: parsed.origin,
    pageId: requiredString(pageId, "pageId"),
    sessionId: requiredString(sessionId, "sessionId")
  };
}

function normalizeEffect(effect) {
  if (!isPlainObject(effect)) {
    throw codedTypeError("stagehand_effect_invalid", "effect must be an object");
  }
  if (!Object.prototype.hasOwnProperty.call(effect, "payload")) {
    throw codedTypeError("stagehand_effect_payload_missing", "effect.payload is required");
  }
  const payload = cloneJsonValue(effect.payload, "effect.payload");
  return {
    target: requiredString(effect.target, "effect.target"),
    payload,
    payloadHash: digestObject(payload),
    ...(Object.prototype.hasOwnProperty.call(effect, "expectedEvidence")
      ? { expectedEvidence: cloneJsonValue(effect.expectedEvidence, "effect.expectedEvidence") }
      : {})
  };
}

function cloneJsonObject(value, name) {
  if (!isPlainObject(value)) {
    throw codedTypeError("stagehand_json_object_invalid", `${name} must be an object`);
  }
  return cloneJsonValue(value, name);
}

function cloneJsonValue(value, name) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw codedTypeError("stagehand_json_value_invalid", `${name} contains a non-finite number`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => cloneJsonValue(entry, `${name}[${index}]`));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneJsonValue(entry, `${name}.${key}`)])
    );
  }
  throw codedTypeError(
    "stagehand_json_value_invalid",
    `${name} must contain only JSON values`
  );
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredString(value, name, errorName = "TypeError") {
  if (typeof value !== "string" || !value.trim()) {
    if (errorName !== "TypeError") {
      throw namedError(errorName, `${name} is required`);
    }
    throw codedTypeError("stagehand_required_field_missing", `${name} is required`);
  }
  return value.trim();
}

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} is required`);
}

function codedTypeError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function namedError(name, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = name;
  return error;
}

function errorCode(error, fallback) {
  return typeof error?.code === "string" && error.code ? error.code : fallback;
}
