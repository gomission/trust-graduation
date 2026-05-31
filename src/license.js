export const LICENSE_VERSION = 1;
export const LICENSE_PREFIX = "tg1";

export const DEFAULT_PROTOCOL_LICENSE = Object.freeze({
  version: LICENSE_VERSION,
  issuer: "trust-graduation-local",
  subject: "local-integration",
  product: "trust-graduation",
  plan: "free-protocol",
  features: ["core", "schemas", "approval-packets", "local-evidence"],
  modules: [],
  issued_at: "",
  expires_at: ""
});

function base64url(value) {
  if (typeof Buffer !== "undefined") return Buffer.from(value).toString("base64url");
  const encoded = btoa(value);
  return encoded.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64url").toString("utf8");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function stablePayload(payload = {}) {
  return {
    version: LICENSE_VERSION,
    issuer: payload.issuer || "trust-graduation-local",
    subject: payload.subject || "local-integration",
    product: payload.product || "trust-graduation",
    plan: payload.plan || "free-protocol",
    features: Array.isArray(payload.features) ? [...payload.features].sort() : [...DEFAULT_PROTOCOL_LICENSE.features],
    modules: Array.isArray(payload.modules) ? [...payload.modules].sort() : [],
    issued_at: payload.issued_at || new Date().toISOString(),
    expires_at: payload.expires_at || "",
    metadata: payload.metadata || {}
  };
}

export function createLicenseToken(payload = {}) {
  return `${LICENSE_PREFIX}.${base64url(JSON.stringify(stablePayload(payload)))}`;
}

export function decodeLicenseToken(token = "") {
  const raw = String(token || "").trim();
  if (!raw) return { ok: true, source: "default", license: { ...DEFAULT_PROTOCOL_LICENSE }, active: true };
  const parts = raw.split(".");
  if (parts[0] !== LICENSE_PREFIX || parts.length !== 2) {
    return { ok: false, source: "token", error: "invalid license token format", license: null, active: false };
  }
  try {
    const license = stablePayload(JSON.parse(decodeBase64url(parts[1])));
    const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
    const expired = Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < new Date());
    return { ok: true, source: "token", license, expired, active: !expired };
  } catch (error) {
    return { ok: false, source: "token", error: error.message || "invalid license token", license: null, active: false };
  }
}

export function licenseAllows(status = {}, entitlement = "core") {
  if (!status.active) return false;
  const value = String(entitlement || "").trim();
  const features = new Set(status.license?.features || status.features || []);
  const modules = new Set(status.license?.modules || status.modules || []);
  return features.has("*") || modules.has("*") || features.has(value) || modules.has(value);
}

