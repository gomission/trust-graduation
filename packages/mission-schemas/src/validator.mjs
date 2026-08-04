// Copyright 2026 Phenomena Labs Ltd
// SPDX-License-Identifier: Apache-2.0
//
// Minimal, zero-dependency JSON Schema Draft 2020-12 validator.
//
// Supports the exact subset of keywords used by @gomission/mission-schemas:
//   type, const, enum, required, properties, additionalProperties,
//   pattern, minLength, maxLength, minimum, items, $ref
//
// This is not a general-purpose validator. It exists so the Trust Graduation
// protocol conformance surface has no runtime dependency. Callers who need a
// full JSON Schema Draft 2020-12 implementation should use ajv or similar in
// their own toolchain; the schemas in ./schemas/ are Draft 2020-12 compatible.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.join(__dirname, "schemas");

const SCHEMA_CACHE = new Map();

function shortIdFromUrl(id) {
  if (!id) return "";
  const match = String(id).match(/^https?:\/\/[^/]+\/(.+)\.json$/);
  return match ? match[1] : "";
}

function loadSchemaByFile(fileName) {
  const cached = SCHEMA_CACHE.get(fileName);
  if (cached) return cached;
  const full = path.join(SCHEMAS_DIR, fileName);
  const text = fs.readFileSync(full, "utf8");
  const parsed = JSON.parse(text);
  SCHEMA_CACHE.set(fileName, parsed);
  if (parsed.$id) {
    SCHEMA_CACHE.set(parsed.$id, parsed);
    const shortId = shortIdFromUrl(parsed.$id);
    if (shortId) SCHEMA_CACHE.set(shortId, parsed);
  }
  return parsed;
}

function preloadAllSchemas() {
  for (const file of fs.readdirSync(SCHEMAS_DIR)) {
    if (file.endsWith(".json")) loadSchemaByFile(file);
  }
}
preloadAllSchemas();

/** Return a schema by its $id (URL) or short name ("action", "receipt", etc). */
export function getSchema(reference) {
  if (SCHEMA_CACHE.has(reference)) return SCHEMA_CACHE.get(reference);
  const alias = `${reference}.json`;
  if (SCHEMA_CACHE.has(alias)) return SCHEMA_CACHE.get(alias);
  throw new Error(`unknown schema reference: ${reference}`);
}

/** Return all known schemas as an object keyed by $id. */
export function allSchemas() {
  const out = {};
  for (const [key, value] of SCHEMA_CACHE) {
    if (typeof key === "string" && key.startsWith("http")) out[key] = value;
  }
  return out;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function checkType(schema, value, path, errors) {
  const t = schema.type;
  if (!t) return;
  const actual = typeOf(value);
  const allowed = Array.isArray(t) ? t : [t];
  // integer is a subtype of number.
  if (actual === "integer" && allowed.includes("number")) return;
  if (allowed.includes(actual)) return;
  errors.push({ path, keyword: "type", message: `expected ${allowed.join("|")}, got ${actual}` });
}

function checkConst(schema, value, path, errors) {
  if (!("const" in schema)) return;
  if (JSON.stringify(schema.const) !== JSON.stringify(value)) {
    errors.push({ path, keyword: "const", message: `expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}` });
  }
}

function checkEnum(schema, value, path, errors) {
  if (!schema.enum) return;
  if (!schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) {
    errors.push({ path, keyword: "enum", message: `must be one of ${JSON.stringify(schema.enum)}` });
  }
}

function checkPattern(schema, value, path, errors) {
  if (!schema.pattern || typeof value !== "string") return;
  const re = new RegExp(schema.pattern);
  if (!re.test(value)) errors.push({ path, keyword: "pattern", message: `does not match ${schema.pattern}` });
}

function checkLengths(schema, value, path, errors) {
  if (typeof value !== "string") return;
  if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path, keyword: "minLength", message: `shorter than ${schema.minLength}` });
  if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path, keyword: "maxLength", message: `longer than ${schema.maxLength}` });
}

function checkMinimum(schema, value, path, errors) {
  if (schema.minimum === undefined) return;
  if (typeof value !== "number" || value < schema.minimum) errors.push({ path, keyword: "minimum", message: `below minimum ${schema.minimum}` });
}

function checkObject(schema, value, path, errors) {
  if (typeOf(value) !== "object" || !schema.properties && !schema.required && schema.additionalProperties === undefined) return;
  if (schema.required) {
    for (const key of schema.required) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push({ path, keyword: "required", message: `missing required property: ${key}` });
    }
  }
  const props = schema.properties || {};
  const additional = schema.additionalProperties;
  for (const key of Object.keys(value)) {
    const p = `${path}/${key}`;
    if (props[key]) {
      validateSubschema(props[key], value[key], p, errors);
    } else if (additional === false) {
      errors.push({ path: p, keyword: "additionalProperties", message: `unknown property: ${key}` });
    }
  }
}

function checkArray(schema, value, path, errors) {
  if (!Array.isArray(value) || !schema.items) return;
  for (let i = 0; i < value.length; i += 1) {
    validateSubschema(schema.items, value[i], `${path}/${i}`, errors);
  }
}

function validateSubschema(schema, value, path, errors) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    const referenced = SCHEMA_CACHE.get(schema.$ref);
    if (!referenced) {
      errors.push({ path, keyword: "$ref", message: `unknown $ref: ${schema.$ref}` });
      return;
    }
    validateSubschema(referenced, value, path, errors);
    return;
  }
  checkType(schema, value, path, errors);
  checkConst(schema, value, path, errors);
  checkEnum(schema, value, path, errors);
  checkPattern(schema, value, path, errors);
  checkLengths(schema, value, path, errors);
  checkMinimum(schema, value, path, errors);
  checkObject(schema, value, path, errors);
  checkArray(schema, value, path, errors);
}

/**
 * Validate `value` against a schema referenced by $id, short name, or filename.
 * Returns { ok: boolean, errors: [{path, keyword, message}] }.
 */
export function validate(reference, value) {
  const schema = getSchema(reference);
  const errors = [];
  validateSubschema(schema, value, "", errors);
  return { ok: errors.length === 0, errors };
}
