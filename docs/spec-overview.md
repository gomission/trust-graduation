# Trust Graduation 1.0 Overview

Status: alpha draft

Trust Graduation is a standard for permissioned AI agent autonomy.

The protocol does not grant global trust. It evaluates one action class at a time, using evidence from a user's actual approvals, edits, rejections, receipts, outcomes, trust issues, and rollbacks.

## Core Rule

An agent may execute only what it has earned for this user, in this action class, under these constraints.

## Autonomy Ladder

| Level | Name | Meaning |
|---:|---|---|
| 0 | Observe | Read, summarize, flag, and explain. |
| 1 | Prepare | Draft, rank, route, and assemble review packets. |
| 2 | Stage | Pre-fill local packets or commands for final review. |
| 3 | Execute Narrow | Execute bounded low-risk actions with receipts. |
| 4 | Delegate | Run bounded workflows inside a defined domain. |
| 5 | Govern | Recommend policy or autonomy changes. |

## Default Boundary

External sends, public posts, calendar invites, money movement, legal commitments, irreversible changes, and permission changes require human approval unless a separate policy explicitly says otherwise.

## Entitlement Boundary

The reference package includes a free-stage license entitlement payload so protocol features can be gated later without changing the decision contract. Entitlements govern access to protocol capabilities such as `core`, `schemas`, `approval-packets`, `local-evidence`, and future federation. They do not grant autonomy. Only evidence plus policy can do that.

## Public Promise

Never sends without approval.
