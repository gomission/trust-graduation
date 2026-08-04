# @gomission/mission-schemas

The open protocol vocabulary for the Trust Graduation Protocol: JSON Schema Draft 2020-12 definitions for the action, grant, decision, policy, receipt, execution, authority-interruption, signature, and public-key-manifest objects; a canonical action-class taxonomy; deterministic canonicalization rules; and a zero-dependency conformance CLI.

**Apache-2.0 licensed.** Independent implementations may import these schemas, versions, and canonicalization rules without any commercial coupling to Mission.

## Install

Node 20+. Zero runtime dependencies.

```
npm install @gomission/mission-schemas
```

## What's inside

- `versions.mjs` — every schema identifier in one place. Never construct schema strings from parts.
- `action-classes.mjs` — canonical vocabulary. Each capability declares `risk_class` and `external_side_effects`.
- `canonicalization.mjs` — `canonicalJson`, `digestObject`, `computeReceiptDigests`, `receiptSigningBytes`. Deterministic and stable.
- `schemas/*.json` — JSON Schema Draft 2020-12 for every protocol object.
- `validator.mjs` — minimal zero-dependency validator that supports the exact subset of Draft 2020-12 used by these schemas. Full validators (ajv etc.) work identically against the same schema files.
- `conformance.mjs` — cross-object reference checks: digest chain, tenant integrity, signature-domain drift.
- `bin/mission-schemas-conform` — CLI with stable JSON output.
- `fixtures/positive/` — one valid example per schema.
- `fixtures/adversarial/` — one representative failure per rejection class (unknown field, wrong version, malformed digest, wrong algorithm, missing required field).

## Use

```js
import {
  SCHEMA_RECEIPT,
  CURRENT_RECEIPT_SCHEMA,
  computeReceiptDigests,
  receiptSigningBytes,
  validate,
  validateReceiptChain,
} from "@gomission/mission-schemas";

const digests = computeReceiptDigests({ action, grant, decision, policy, payload });
const bytes = receiptSigningBytes(receipt);
const check = validate(SCHEMA_RECEIPT, receipt);
if (!check.ok) throw new Error(JSON.stringify(check.errors));
```

## Conformance CLI

```
mission-schemas-conform --schema mission-execution-receipt/v2 --file receipt.json
mission-schemas-conform --chain --file chain.json
cat receipt.json | mission-schemas-conform --schema mission-execution-receipt/v2
```

Exit 0 on ok, 1 on failure. Emits stable JSON on stdout.

## Ownership

Per the Trust Graduation package ownership matrix:

- **@gomission/mission-schemas** (this package): protocol vocabulary, schemas, canonicalization, conformance.
- **@trust-graduation/core**: earned-authority method and graduation calculations.
- **@gomission/openai-agents-adapter**: OpenAI Agents SDK runtime integration.
- **@gomission/mcp**: MCP transport integration.
- Mission core: commercial reference implementation and product behavior.

The canonical source for this package is now the public Trust Graduation repository. Mission may vendor the package source while its private runtime migrates to the published dependency, but protocol changes originate here.

## Versioning promise

Schema identifiers are additive. `mission-execution-receipt/v2` will always mean this shape. New versions may be added; existing versions may not be silently renamed. Every emitted `schema` field is stable across upgrades.

## License

Apache-2.0. See LICENSE.
