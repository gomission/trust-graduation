# Security policy

Report suspected vulnerabilities privately to **mission@gomission.io**. Include
an affected package/version, a concise description, and a minimal reproduction
using synthetic data. Do not include live credentials, private workspace data,
or exploit details in a public issue.

Please allow maintainers to assess the report and coordinate a fix before
public disclosure. No response-time or security-certification guarantee is
implied by this policy.

## Scope and integration requirements

This repository contains the public Trust Graduation protocol, SDK references,
schemas, and integration examples. Hosted Mission services and the private
Mission engine are maintained separately.

A policy decision or plain approval flag is not execution authorization. Hosts
must authenticate the principal and grant issuer, bind approval to the exact
action and workspace, atomically consume grants using a durable shared store,
and retain verifiable provider receipts. The memory store is for demos and
single-process tests. Cryptographic receipt verification, tenant isolation,
secret management, and provider credentials remain host responsibilities.

The JavaScript beta provider gate is the maintained execution integration.
Python and Go alpha ports are planning-only for approval-gated or unknown
operations. Use explicit reviewed versions and read migration notes before
updating. This experimental protocol does not guarantee the safety or alignment
of arbitrary agents or certify a production integration.
