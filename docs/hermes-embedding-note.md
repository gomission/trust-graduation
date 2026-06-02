# Embedding Trust Graduation in Hermes-Class Agents

Status: positioning note for protocol v0.1

Hermes-class agents prove the market wants capable local agents with memory, tools, skills, and multi-platform reach. Trust Graduation does not compete with that engine. It supplies the permission layer an engine needs before it acts around real accounts, money, public channels, and relationships.

The useful frame:

> Agent engines need a brake that gets smarter. Trust Graduation is that brake.

## The Gap

Modern agent systems can already observe, plan, draft, call tools, and run workflows. The hard problem is not only capability. It is bounded autonomy:

- Which action class is being attempted?
- What evidence has this agent earned for this user?
- Is the action low-risk internal work or an external side effect?
- What must the human approve?
- What receipt proves what happened?
- What trust issue forces regression?

Trust Graduation answers those questions with a small, embeddable protocol.

## How a Hermes-Style Runtime Embeds It

1. Load a tool, workflow, or TG-SKILL.md file.
2. Read `trust_graduation.action_class`.
3. Ask the local evidence ledger for this user and action class.
4. Call the Trust Graduation decision function before tool execution.
5. If allowed, execute and write a receipt.
6. If not allowed, render the approval packet in the user's current gateway: CLI, Telegram, Slack, Discord, email, or web UI.
7. Record approval, edit, rejection, receipt, rollback, or trust issue back into the ledger.

## What This Avoids

- Global trust. A clean drafting record does not grant permission to send money, publish posts, or change permissions.
- Hidden autonomy. The action class and approval reason are visible before execution.
- Self-modifying skills. Skill updates require human review outside the live action.
- Fake privacy theater. Sanitized, approval-gated receipts allow product learning without exposing private content.

## Adoption Hook

The first portable artifact is `TG-SKILL.md`: an agentskills-compatible skill file with a Trust Graduation binding. Existing agent ecosystems can keep their skill distribution model while adding action-class safety.

This makes Trust Graduation additive:

- Skill registries can index the file.
- Agent runtimes can execute the instructions.
- Safety layers can enforce the trust binding.
- Users can carry skills between systems without losing approval semantics.

## One-Line Pitch

Trust Graduation is the safety layer open agents need before they act.
