# Contributing

Pull requests are welcome.

## Development

Run the full local check before opening a PR:

```bash
npm test
python3 -m compileall packages/python/trust_graduation
cd packages/go && go test ./...
```

## Schema Versioning

- Additive schema fields may land in draft `schemas/v1/`.
- Breaking schema changes require a new schema directory, such as `schemas/v2/`.
- Keep the JavaScript reference implementation aligned with the latest draft schema.
- Python and Go ports should preserve the same decision payload shape.

## DCO

By contributing, you certify that you have the right to submit the work under the Apache-2.0 license and agree to the Developer Certificate of Origin 1.1.

