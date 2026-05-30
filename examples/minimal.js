import { TrustGraduation } from "../src/index.js";

const localLedger = [
  { actionClass: "draft.response", type: "approved", source: "draft-feedback" },
  { actionClass: "draft.response", type: "approved", source: "draft-feedback" },
  { actionClass: "draft.response", type: "approved", source: "draft-feedback" },
  { actionClass: "draft.response", type: "edited", editDistance: 0.1, source: "draft-feedback" },
  { actionClass: "draft.response", type: "sent_with_receipt", source: "receipts" }
];

const tg = new TrustGraduation({ workspace: "user-123", evidence: localLedger });

const draftDecision = tg.canExecute({
  actionClass: "draft.response",
  context: { target: "follow-up email" }
});

const sendDecision = tg.canExecute({
  actionClass: "email.send.external",
  context: { recipient: "buyer@example.com", hasReceipts: true }
});

console.log({ draftDecision, sendDecision });

