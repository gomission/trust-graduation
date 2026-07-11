# Most AI agents will burn your reputation. Here's the standard that won't.

> Trust Graduation v1.0 is published today as an open protocol for human-gated agent autonomy. This is the long-form thinking behind it.

Date: 2026-05-31
Author: Phenomena Labs Ltd
License: Apache-2.0
Repo: [github.com/gomission/trust-graduation](https://github.com/gomission/trust-graduation)

---

Every AI agent product has the same architecture for action. A user installs the agent, grants it permissions, and the agent does things. Send this email. Post this update. Commit this code. Schedule this meeting.

The model assumes the user can predict what "do things" will produce.

This model breaks the moment an agent sends an email to the wrong person, posts something embarrassing, books a meeting that did not need booking, or commits a change that breaks production. The user, not the model, owns the reputational cost.

In 2026 we have abundant evidence that this happens. Autonomous coding agents have deleted production databases. Computer-use demos have emailed competitor contact lists. Multiple agent products have shipped silent actions that broke release pipelines and customer relationships. Every agent vendor will recite the safety controls in their settings panel. Every user will report the moment those controls did not catch the thing that mattered.

The fix is not better controls. The fix is a different model for what permission means.

## Most "AI safety" is a binary toggle

Today's agent products treat autonomy as a global setting. The user grants the agent permission to "send email," and the agent can now send email. Forever. To anyone. About anything. The user is asked to predict, in advance, every situation where they trust their agent enough to send unsupervised.

This is a category error. Trust is not a setting you grant. Trust is earned over time, in specific situations, by specific evidence. Humans extend trust per action class. We hand a junior employee one task. We watch what happens. Based on the outcome, we either expand their lane or pull them back. We do not give a junior employee the company credit card on day one.

The current AI agent permission model is the equivalent of giving every new employee the company credit card on day one, with a checkbox the manager can untick after the first failure.

## Trust Graduation: autonomy earned per action class

Today we are open-sourcing **Trust Graduation**, a permission protocol for human-gated agent autonomy. The full spec, the reference implementation, the JSON schemas, and the multi-language ports are at [github.com/gomission/trust-graduation](https://github.com/gomission/trust-graduation).

The protocol asks one question, per action class, per user, per moment:

> What has this agent earned the right to do for this user, in this action class, under these constraints?

Not "what can the agent automate." Not "what is the agent's global trust level." A specific question about a specific action, evaluated against a specific evidence ledger.

### The autonomy ladder

Trust Graduation defines six levels of earned autonomy:

| Level | Name | Agent may do | Human controls |
|---:|---|---|---|
| 0 | Observe | Read, summarize, flag | Every decision |
| 1 | Prepare | Draft, rank, route | Send, post, approve |
| 2 | Stage | Pre-fill, queue commands | Final click |
| 3 | Execute Narrow | Preapproved low-risk actions | Audit, revoke |
| 4 | Delegate | Bounded workflows in a domain | Outcomes, boundaries |
| 5 | Govern | Recommend policy changes | Authority changes |

The agent does not occupy one level. It occupies a different level per action class. The agent that has earned Level 3 on "local memory write" may still be at Level 1 on "email send external." The agent that has earned Level 4 on "draft revision" may still be at Level 0 on "calendar invite external." Trust is granular, evidence-bound, and revocable.

### Evidence, not vibes

Most AI products measure agent quality by model confidence or benchmark scores. Trust Graduation measures it by a specific evidence ledger.

**Counts as evidence:**
- Approved, edited, rejected, or held drafts
- Sent messages with receipts
- Replies recovered
- Meetings booked
- Outcomes logged
- Corrections from the human
- Trust issues reported
- Rollback or repair events

**Does not count as evidence:**
- More generated drafts
- More dashboards
- Model confidence scores
- Synthetic benchmark wins
- Sample workspace successes
- Prepared work with no decision or outcome

If the agent prepares 50 emails and the user approves 0, the agent has not earned Level 1 on email. It has produced 50 artifacts.

### The public promise: never sends without approval

External sends, public posts, calendar invites, money movement, legal commitments, irreversible changes, and permission changes require human approval unless a separate policy explicitly says otherwise.

Trust Graduation does not let an agent send email, post publicly, or spend money on a user's behalf. The protocol prepares the action and produces a standard approval packet. The human decides. The decision is logged as evidence. The next time the same action class comes up, that evidence informs whether approval is still required.

This is the inversion of the standard AI agent pitch. Most products promise "your AI assistant does it for you." Trust Graduation promises "your AI assistant earns the right to do it for you."

## Running in production today, on Claude Desktop

The Trust Graduation reference implementation is live in [Mission](https://github.com/gomission/mission), a local-first execution operating system for professional goals and relationships.

As of today, Mission is the first product to bind a Claude Desktop session to a Trust Graduation runtime. The integration is one CLI command:

```bash
mission mcp install-claude --workspace=~/your-workspace
```

After this command, Claude Desktop reads the user's workspace state, prepares drafts, logs evidence, and requests approval. Every external action goes through Trust Graduation's `canExecute` decision. Every action class is gated until the user has approved enough specific instances for the protocol to graduate autonomy. The Mission MCP server exposes 36 read-first tools and zero tools that take external action without an approval packet.

This is not a slide deck. It is running tonight on the founder's laptop.

## The protocol family

Trust Graduation v1 covers permission gating and approval payloads. Three additional primitives are designed and roadmapped publicly. Each ships as a separate package, gated on real adoption of the prior one.

- **`@trust-graduation/receipts`** — universal evidence shape so agent actions become legible across products
- **`@trust-graduation/open-loops`** — shared pending-work surface so agents can claim, close, dedupe, hand off
- **`@trust-graduation/voice`** — portable voice profile so drafts stay consistent across the user's agents

Each new primitive makes earlier embeds more valuable. An agent product that embeds `core` gets autonomy gating. Plus `receipts` adds federated evidence. Plus `open-loops` adds work deduplication. Plus `voice` adds consistent drafting. The vendor that adopts the full stack has outsourced the "this user has multiple agents" coordination problem to an open standard.

The roadmap is in `docs/adoption-roadmap.md`. The honest gate is in the README: no new package ships until the prior primitive has at least one external embed.

## Embed it

The reference implementation is Apache-2.0 licensed, has zero runtime dependencies, and embeds in six lines:

```js
import { TrustGraduation } from "@trust-graduation/core";

const tg = new TrustGraduation({ workspace: "user-123", evidence: localLedger });
const decision = tg.canExecute({ actionClass: "email.send.external", context: { recipient, body } });

if (decision.allowed) await actuallySend();
else if (decision.needsApproval) await pushApprovalToUser(decision.packet);
```

A vendor adopts Trust Graduation by:

1. Installing the package
2. Mapping the vendor's action classes to TG action classes
3. Returning TG's approval packets through the vendor's existing approval UX
4. Logging evidence after each user decision

Average integration time across the reference implementation: less than a day for a single-engineer team.

## What changes when this becomes standard

Today every agent vendor reinvents the permission layer. Every implementation is slightly different. Users learn to trust each agent separately, with no portability when they try a new product. A user who has approved 1,000 email sends in one agent gets no credit when they try a different one for the same email pattern. Each new agent starts from zero.

When Trust Graduation becomes the embedded standard, evidence becomes portable. The user's autonomy graph travels across products. An action class that has earned Level 3 in one product can inform autonomy in another. The user has one approval queue, one evidence ledger, one autonomy graph across every AI agent in their life. Each new agent that ships is born into the user's existing trust state.

This is the network effect the protocol is building toward. The standard gets more valuable with every embed.

## What this is not

Trust Graduation is not an alignment framework, a model safety harness, or a substitute for thoughtful product design. It is a permission layer. It assumes the agent above it is competent at preparing useful drafts and the human below it is competent at approving them. It addresses one specific category of failure: agents that take consequential action faster than human trust accumulates.

It also does not solve the agent's tendency to confidently produce wrong outputs. A drafted email that contains a hallucination is still a drafted email. Trust Graduation gates whether the email gets sent. It does not gate whether the email is true. That problem remains.

## The call

If you are building an agent product, embed `@trust-graduation/core`. The npm package is live (`npm install @trust-graduation/core`). The schemas at `/schemas/v1/` are stable. The reference implementation has been running in production.

If you are writing about agent safety, the autonomy framing is the news. The market has been told for 18 months that agents will "do everything for you." Trust Graduation is the standard that says agents should earn what they do for you, on real evidence, per action class.

If you are using agents and have been silently nervous about what they might do unsupervised, the public promise of Trust Graduation is the answer: **never sends without approval**.

## What's next

The protocol is at [github.com/gomission/trust-graduation](https://github.com/gomission/trust-graduation). The package is live at [`@trust-graduation/core`](https://www.npmjs.com/package/@trust-graduation/core) on npm. The next primitive in the family is receipts. The first three integrations are open offers; the maintainers will help any agent product team embed in one day.

The reference implementation is Mission, available at [github.com/gomission/mission](https://github.com/gomission/mission).

Contact: [missionexecutionlayer@gmail.com](mailto:missionexecutionlayer@gmail.com).

---

*Phenomena Labs Ltd, 2026. This essay is the long-form companion to the Trust Graduation v1.0 release. The protocol is Apache-2.0 and accepts pull requests at the linked repository.*
