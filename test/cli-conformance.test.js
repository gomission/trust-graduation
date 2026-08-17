import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const cli = path.join(repo, "src", "cli.js");

test("CLI scaffolds a non-overwriting adapter and proves it through conformance", () => {
  const temporary = fs.mkdtempSync(path.join(repo, ".tmp-provider-gate-"));
  try {
    const scaffold = spawnSync(process.execPath, [cli, "init-adapter"], {
      cwd: temporary,
      encoding: "utf8"
    });
    assert.equal(scaffold.status, 0, scaffold.stderr);
    const adapterPath = path.join(temporary, "mission-gate-adapter.mjs");
    assert.equal(fs.existsSync(adapterPath), true);
    const adapterSource = fs.readFileSync(adapterPath, "utf8");
    assert.doesNotMatch(adapterSource, /mapProviderInput/);
    assert.match(adapterSource, /createProviderGate\(dependencies\)/);

    const duplicate = spawnSync(process.execPath, [cli, "init-adapter"], {
      cwd: temporary,
      encoding: "utf8"
    });
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /Refusing to overwrite/);

    const conformance = spawnSync(process.execPath, [
      cli,
      "conformance",
      "./mission-gate-adapter.mjs",
      "--json"
    ], {
      cwd: temporary,
      encoding: "utf8"
    });
    assert.equal(conformance.status, 0, conformance.stderr);
    assert.match(conformance.stdout, /^CONFORMANCE_RESULT /);
    const result = JSON.parse(conformance.stdout.replace(/^CONFORMANCE_RESULT /, ""));
    assert.equal(result.ok, true);
    assert.equal(result.provider_calls.after_mutation, 0);
    assert.equal(result.provider_calls.after_replay, 1);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("stagehand demo fails with an exact install command when the optional runtime is absent", () => {
  const result = spawnSync(process.execPath, [cli, "stagehand-demo"], {
    cwd: repo,
    encoding: "utf8"
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /stagehand-demo requires @browserbasehq\/stagehand@4\.0\.1/);
  assert.match(result.stderr, /trust-graduation stagehand-demo/);
});
