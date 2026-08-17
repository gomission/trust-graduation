import assert from "node:assert/strict";
import http from "node:http";

import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
import {
  createApprovalGrant,
  createMemoryGrantStore,
  createStagehandProviderAction,
  createStagehandProviderGate,
  digestObject
} from "../src/index.js";

const checkedAt = new Date("2026-08-17T12:00:00.000Z");
const logicalSessionId = "local-stagehand-session-1";
const target = "orders/order-42/submit";
const payload = Object.freeze({ orderId: "order-42", quantity: 2 });
const events = [];
const receipts = [];
let stagehandCalls = 0;
let llmCalls = 0;

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/orders/42") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(orderPage(payload));
      return;
    }
    if (request.method === "POST" && request.url === "/api/orders/42/submit") {
      const receivedPayload = JSON.parse(await readBody(request));
      const providerEvent = {
        id: `event-${events.length + 1}`,
        type: "order.submitted",
        target,
        payload: receivedPayload,
        payloadHash: digestObject(receivedPayload)
      };
      events.push(providerEvent);
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: true, eventId: providerEvent.id }));
      return;
    }
    response.writeHead(404).end();
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

let browser;
let stagehand;

try {
  const baseUrl = await listen(server);
  browser = await localBrowser.launch({ headless: true });
  stagehand = await Stagehand.create({
    browser,
    selfHeal: false,
    logging: { level: "off", format: "pretty" },
    model: {
      async generate() {
        llmCalls += 1;
        throw new Error("inference is disabled for this governed deterministic action");
      }
    }
  });

  const pageUrl = `${baseUrl}/orders/42`;
  const [page] = await stagehand.browser.context.pages();
  if (!page) throw new Error("Stagehand local browser did not expose a page");
  await page.goto(pageUrl);

  const exactAction = Object.freeze({
    selector: "#submit-order",
    description: "Click the final order submit button",
    method: "click",
    arguments: []
  });
  const requested = createStagehandProviderAction({
    actionClass: "browser.order.submit.external",
    workspace: "workspace-local-proof",
    principal: "principal-local-proof",
    requestedBy: "stagehand-agent",
    tenant: "tenant-local-proof",
    stagehandAction: exactAction,
    pageUrl,
    pageId: page.pageId,
    sessionId: logicalSessionId,
    effect: {
      target,
      payload,
      expectedEvidence: { eventType: "order.submitted", status: "accepted" }
    },
    constraints: { environment: "local-proof" },
    expiresAt: "2026-08-17T12:10:00.000Z",
    nonce: "local-proof-nonce-1"
  });

  const gate = createStagehandProviderGate({
    stagehand: {
      async act(action, options) {
        stagehandCalls += 1;
        return await stagehand.act(action, options);
      }
    },
    getPageContext: async () => ({
      url: await page.url(),
      pageId: page.pageId,
      sessionId: logicalSessionId,
      page
    }),
    confirmEffect: async ({ expected }) => {
      const providerEvent = await waitForEvent(() => events.find((event) =>
        event.target === expected.target &&
        event.payloadHash === expected.payloadHash &&
        event.type === expected.expectedEvidence?.eventType
      ));
      if (!providerEvent) return { ok: false };
      return {
        ok: true,
        providerEventId: providerEvent.id,
        target: providerEvent.target,
        payloadHash: providerEvent.payloadHash,
        evidence: {
          eventType: providerEvent.type,
          status: "accepted",
          serverEventCount: events.length
        }
      };
    },
    store: createMemoryGrantStore(),
    authenticateGrant: async () => true,
    writeReceipt: async (receipt) => {
      receipts.push(receipt);
      return { ok: true };
    },
    now: () => checkedAt,
    createId: (() => {
      let value = 0;
      return () => `local-proof-receipt-${++value}`;
    })()
  });

  const binding = gate.prepare(requested);
  const approval = createApprovalGrant({
    binding,
    grantId: "local-proof-grant-1",
    issuer: "principal:principal-local-proof",
    issuedAt: checkedAt.toISOString()
  });
  const changed = createStagehandProviderAction({
    actionClass: requested.actionClass,
    workspace: requested.workspace,
    principal: requested.principal,
    requestedBy: requested.requestedBy,
    tenant: requested.tenant,
    stagehandAction: exactAction,
    pageUrl: requested.input.page.url,
    pageId: requested.input.page.pageId,
    sessionId: requested.input.page.sessionId,
    effect: { target, payload: { orderId: "order-42", quantity: 3 } },
    constraints: { environment: "local-proof" },
    expiresAt: requested.expiresAt,
    nonce: requested.nonce
  });

  const missing = await gate.execute({ binding, approval: null, action: requested });
  const mutated = await gate.execute({ binding, approval, action: changed });
  assert.equal(missing.providerCalled, false);
  assert.equal(mutated.reason, "action_hash_mismatch");
  assert.equal(stagehandCalls, 0);
  assert.equal(events.length, 0);

  const raced = await Promise.all([
    gate.execute({ binding, approval, action: requested }),
    gate.execute({ binding, approval, action: requested })
  ]);
  const confirmed = raced.find((result) => result.ok);
  const deniedRace = raced.find((result) => result.reason === "grant_already_consumed");
  assert.ok(confirmed);
  assert.ok(deniedRace);
  assert.equal(confirmed.providerResult.providerEventId, "event-1");
  assert.equal(confirmed.providerResult.payloadHash, digestObject(payload));
  assert.equal(stagehandCalls, 1);
  assert.equal(llmCalls, 0);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].payload, payload);
  assert.equal(receipts.length, 1);

  const replay = await gate.execute({ binding, approval, action: requested });
  assert.equal(replay.reason, "grant_already_consumed");
  assert.equal(stagehandCalls, 1);
  assert.equal(events.length, 1);
  assert.equal(receipts.length, 1);

  console.log(`REAL_STAGEHAND_GATE_RESULT ${JSON.stringify({
    ok: true,
    browserProvider: browser.provider,
    stagehandCalls,
    llmCalls,
    serverEvents: events.length,
    receipts: receipts.length,
    missingApprovalProviderCalled: missing.providerCalled,
    mutationReason: mutated.reason,
    raceDeniedReason: deniedRace.reason,
    replayReason: replay.reason,
    providerEventId: confirmed.providerResult.providerEventId,
    payloadHash: confirmed.providerResult.payloadHash
  })}`);
} finally {
  if (stagehand) await stagehand.close().catch(() => undefined);
  if (browser) await browser.close().catch(() => undefined);
  await close(server);
}

function orderPage(exactPayload) {
  const serialized = JSON.stringify(exactPayload).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Mission Gate local proof</title></head>
  <body>
    <main>
      <h1>Order 42</h1>
      <form id="order-form">
        <button id="submit-order" type="submit">Submit exact order</button>
      </form>
      <output id="status">not submitted</output>
    </main>
    <script>
      const form = document.querySelector("#order-form");
      const button = document.querySelector("#submit-order");
      const status = document.querySelector("#status");
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        button.disabled = true;
        const response = await fetch("/api/orders/42/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(${serialized})
        });
        const result = await response.json();
        status.textContent = result.accepted ? "accepted:" + result.eventId : "rejected";
      });
    </script>
  </body>
</html>`;
}

function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      httpServer.off("error", reject);
      const address = httpServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("local proof server did not expose a TCP address"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(httpServer) {
  if (!httpServer.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    httpServer.close((error) => error ? reject(error) : resolve());
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 16_384) {
        reject(new Error("request body exceeds local proof limit"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.once("error", reject);
  });
}

async function waitForEvent(read) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return undefined;
}
