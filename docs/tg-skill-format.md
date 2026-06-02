# TG-SKILL.md Format

Status: alpha draft

TG-SKILL.md is a portable skill artifact for agent systems that need the skill definition and the safety boundary in the same file.

It is intentionally compatible with the `SKILL.md` convention: a Markdown file with YAML frontmatter, followed by human-readable implementation instructions. Trust Graduation adds one required frontmatter block: `trust_graduation`.

## Core Rule

A skill may describe how to act, but the Trust Graduation binding decides when it may act.

## Minimal Shape

```yaml
---
name: send-internal-followup
description: Drafts and sends a follow-up inside a thread the user already started.
version: 0.1.0
agentskills_compatible: true
trust_graduation:
  action_class: email.send.internal
  minimum_level: 2
  default_trust: approval_required_per_event
  evidence_required:
    - voice_match >= 78
    - no_external_recipients
    - thread_initiated_by_user
  graduation_path:
    - approval_required_per_event
    - approval_required_per_session
    - weekly_review
  hard_blocks:
    - new_external_recipient
    - legal_commitment
    - money_movement
  receipt_required: true
inputs:
  thread_id: string
  body: string
outputs:
  receipt_id: string
permissions:
  - gmail.thread.read
  - gmail.draft.write
---

## How

1. Read the existing thread.
2. Draft the follow-up in the user's voice.
3. Build an approval packet before any send.
4. Send only after the Trust Graduation decision allows it.
5. Write a receipt.
```

## Required Frontmatter

| Field | Meaning |
|---|---|
| `name` | Portable skill id. Lowercase, stable, and safe for filenames. |
| `description` | Plain-language purpose of the skill. |
| `agentskills_compatible` | Must be `true` while this format uses SKILL.md-style frontmatter plus Markdown instructions. |
| `trust_graduation.action_class` | The action class this skill wants to perform. Trust is earned per action class, not globally. |
| `trust_graduation.default_trust` | The starting trust state before local evidence graduates the action. |
| `trust_graduation.evidence_required` | Human-readable evidence predicates an implementation must evaluate before graduation. |
| `trust_graduation.graduation_path` | Ordered trust states this skill may move through. |

## Trust States

| State | Meaning |
|---|---|
| `observe_only` | Skill may inspect, summarize, or recommend. |
| `approval_required_per_event` | Each proposed action needs explicit approval. |
| `approval_required_per_session` | A bounded session can approve a batch of similar actions. |
| `weekly_review` | Low-risk repeated actions may run with receipts and scheduled review. |
| `autonomous_with_receipts` | Narrow, earned autonomy with mandatory receipts and rollback/review paths. |

## Compatibility Contract

An agent-skills registry may index the file as a normal `SKILL.md` because the body remains Markdown instructions. A Trust Graduation-aware runtime must additionally:

1. Parse the frontmatter.
2. Validate it against `schemas/v1/tg-skill.schema.json`.
3. Map `trust_graduation.action_class` to the runtime's action policy.
4. Build an approval packet when the current evidence does not satisfy the requested trust state.
5. Write a receipt for any executed side effect when `receipt_required` is true.

## Non-Negotiables

- A TG-SKILL.md file cannot self-modify while in use.
- New external recipients, public posts, money movement, legal commitments, and permission changes stay approval-gated unless the user explicitly grants a narrower policy.
- The skill body may explain implementation steps, but it cannot override the Trust Graduation frontmatter.
