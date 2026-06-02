---
name: send-internal-followup
description: Drafts and sends a follow-up inside a thread the user already started.
version: 0.1.0
authors:
  - Phenomena Labs
agentskills_compatible: true
trust_graduation:
  action_class: email.send.internal
  minimum_level: 2
  default_trust: approval_required_per_event
  evidence_required:
    - voice_match >= 78
    - no_external_recipients
    - thread_initiated_by_user
    - last_10_similar_actions_without_trust_issue
  graduation_path:
    - approval_required_per_event
    - approval_required_per_session
    - weekly_review
  hard_blocks:
    - new_external_recipient
    - legal_commitment
    - money_movement
    - confidential_attachment
  receipt_required: true
  approval_packet_template: email-followup-v1
inputs:
  thread_id: string
  body: string
outputs:
  receipt_id: string
permissions:
  - gmail.thread.read
  - gmail.draft.write
  - gmail.send.after_approval
---

# Send Internal Followup

## How

1. Read only the thread identified by `thread_id`.
2. Verify the user already participated in the thread.
3. Verify the recipients are unchanged.
4. Draft the follow-up in the user's voice.
5. Build a Trust Graduation approval packet with the proposed body, recipients, evidence summary, and available decisions.
6. Send only if the Trust Graduation decision allows the action.
7. Write a receipt with timestamp, recipients, subject, decision id, and a short summary.

## Approval Packet

The packet must show:

- Thread subject.
- Recipients.
- Proposed body.
- Why this action is considered `email.send.internal`.
- Evidence used for the current trust level.
- Decisions: approve once, edit, reject, hold.

## Blocks

Do not send when a new external recipient appears, the draft creates a legal commitment, the message moves money, or a confidential attachment is introduced.
