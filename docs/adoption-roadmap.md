# Protocol Adoption Roadmap

Status: alpha operating plan

## Phase 1: Crystallize

Goal: a public spec and package any agent vendor can embed in less than 100 lines.

- Keep the reference implementation pure: JSON in, JSON out.
- Publish the npm package first.
- Keep Python and Go ports API-compatible with the JavaScript decision contract.
- Publish schemas under `/schemas/v1/`.
- Keep license entitlement tokens free-local by default; use them to prove the future monetization boundary without blocking adoption.
- Use the Manifesto as launch positioning, not as a substitute for an embeddable package.

## Phase 2: Seed Adoption

Goal: three named external integrations, including one credible agent product or framework.

Pitch:

> We will help you embed Trust Graduation in one day. You get an approval/evidence safety layer and a standard audit trail. We get the citation.

Good first targets:

- agent frameworks with active maintainers
- open-source products where a PR can be reviewed publicly
- AI infra teams already wrestling with autonomy gates

## Phase 3: Federation

Goal: opt-in cross-product evidence sharing.

The alpha package does not implement federation. It is shaped so a hosted service can later provide the same evidence ledger from multiple products with user consent.

## Phase 4: Governance

Goal: move from a Mission-originated reference implementation to a citeable standard.

Governance should remain lightweight until there are real adopters. Do not create process before adoption.

## Phase 5: Monetization

Potential protocol-side revenue:

- hosted federation
- compliance/audit pack
- enterprise support contracts
- white-label implementation support

The first monetization gate is not pricing. It is external adoption.

In alpha, entitlement tokens should stay permissive. The purpose is to make future hosted federation, compliance packs, and enterprise support attach cleanly to protocol features after adoption, not to add friction before the standard has citations.
