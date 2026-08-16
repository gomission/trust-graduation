import assert from "node:assert/strict";
import test from "node:test";

import { runExactKeyDemo } from "../src/demo.js";

test("one-command exact-key demo rejects mutation, replay, and plain approval", async () => {
  let output = "";
  const result = await runExactKeyDemo({ stdout: { write: (value) => { output += value; } } });
  assert.equal(result.ok, true);
  assert.equal(result.atomic_consume_authorized, true);
  assert.equal(result.mutation_rejected, "action_hash_mismatch");
  assert.equal(result.replay_rejected, "grant_already_consumed");
  assert.equal(result.plain_approval_rejected, "approval_missing_action_hash");
  assert.equal(result.a2a_task_state, "TASK_STATE_AUTH_REQUIRED");
  assert.equal(result.provider_calls, 0);
  assert.match(result.action_hash, /^sha256:[a-f0-9]{64}$/);
  assert.match(output, /^DEMO_RESULT /);
});
