import {
  bindMcpToolAction,
  providerActionFromMcpBinding
} from "@gomission/mcp";
import {
  createApprovalGrant,
  createMemoryGrantStore,
  createProviderGate
} from "@trust-graduation/core";

const now = new Date("2026-08-16T12:00:00.000Z");
const input = {
  to: "buyer@example.com",
  subject: "Exact MCP round trip",
  body: "Only this body may reach the provider"
};
const binding = bindMcpToolAction({
  actionClass: "email.send.external",
  workspace: "/private/example-workspace",
  requestedBy: "mcp-mail-server",
  input,
  now,
  nonce: "mcp-provider-roundtrip"
});
const approval = createApprovalGrant({
  binding,
  grantId: "roundtrip-grant",
  issuer: "principal:roundtrip",
  issuedAt: now.toISOString()
});

let providerCalls = 0;
const receipts = [];
const gate = createProviderGate({
  store: createMemoryGrantStore(),
  authenticateGrant: async ({ approval: presented }) => ({
    ok: presented?.issuer === "principal:roundtrip"
  }),
  provider: async (actualInput) => {
    providerCalls += 1;
    return { providerId: `sandbox-${providerCalls}`, accepted: actualInput };
  },
  writeReceipt: async (receipt) => receipts.push(receipt),
  now: () => now,
  createId: () => `roundtrip-receipt-${receipts.length + 1}`
});

const action = providerActionFromMcpBinding(binding, input);
const mutation = await gate.execute({
  binding,
  approval,
  action: providerActionFromMcpBinding(binding, {
    ...input,
    body: "Changed after approval"
  })
});
const exact = await gate.execute({ binding, approval, action });
const replay = await gate.execute({ binding, approval, action });

const result = {
  ok: mutation.reason === "action_hash_mismatch"
    && exact.ok === true
    && replay.reason === "grant_already_consumed"
    && providerCalls === 1
    && receipts.length === 1
    && receipts[0].actionHash === binding.actionHash,
  mcp_action_hash: binding.actionHash,
  mutation_rejected: mutation.reason,
  exact_execution: exact.reason,
  replay_rejected: replay.reason,
  provider_calls: providerCalls,
  receipts_written: receipts.length,
  provider_result_hash: receipts[0]?.providerResultHash || ""
};

process.stdout.write(`MCP_PROVIDER_ROUNDTRIP ${JSON.stringify(result)}\n`);
if (!result.ok) throw new Error("mcp_provider_roundtrip_failed");
