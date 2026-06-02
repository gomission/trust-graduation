# GitHub And npm Publishing Guide

Trust Graduation public artifacts should make the protocol easy to inspect, install, and cite.

## What Goes To GitHub

The GitHub repo is the public protocol home. It should include:

- `README.md` - hook, install, six-line embed, status, roadmap, and links.
- `src/` - zero-dependency JavaScript reference implementation for `@trust-graduation/core`.
- `schemas/v1/` - stable alpha schemas for core autonomy primitives.
- `schemas/v2/receipts.schema.json` - forward-design preview for receipts, not a shipped package.
- `docs/spec-overview.md` - one-page spec overview.
- `docs/spec-deep-dive.md` - compact protocol details.
- `docs/receipts-forward-design.md` - next-pillar design note.
- `docs/adoption-roadmap.md` - external embed path and discipline gates.
- `docs/github-npm-publishing.md` - this publishing map.
- `docs/pdf/trust-graduation-protocol.pdf` - printable protocol packet.
- `examples/minimal.js` - six-line embed example.
- `packages/python/README.md` and `packages/go/README.md` - language-port placeholders until parity work begins.
- `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`.

The repo should not include private Mission workspace data, customer context, local receipts, secrets, unpublished GTM notes, or product-specific Mission Control internals.

## What Goes To npm

The npm package is the embeddable runtime. It should include:

- `src/` - runtime implementation and TypeScript declarations.
- `schemas/` - protocol schemas.
- `docs/` - public docs and PDF protocol packet.
- `examples/` - minimal embed examples.
- `packages/*/README.md` - language-port status.
- `README.md`, `LICENSE`.

The npm package should not include:

- local workspace data
- `.git`
- private strategy notes
- generated logs
- secrets or connector credentials
- unpublished partner/customer context

The current package boundary is controlled by `package.json` `files`.

## Release Checklist

Before publishing:

1. Run `npm test`.
2. Run `npm run docs:pdf`.
3. Verify `README.md` install and import snippets use `@trust-graduation/core`.
4. Verify `docs/pdf/trust-graduation-protocol.pdf` exists and renders.
5. Verify `package.json` version and `CHANGELOG.md` agree.
6. Run `npm pack --dry-run` and inspect included files.
7. Publish only after the GitHub repo is pushed.

## Discipline Gate

Do not ship `@trust-graduation/receipts`, `@trust-graduation/open-loops`, `@trust-graduation/voice`, or federation packages until the prior primitive has external embed traction. Forward-design schemas are allowed; runtime packages wait for demand.
