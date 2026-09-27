#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runProviderGateConformance } from "./conformance.js";
import { runExactKeyDemo } from "./demo.js";

const command = process.argv[2] || "demo";

if (command === "demo") {
  await runExactKeyDemo();
} else if (command === "turn-demo") {
  let outputDir, json = false, usageError;
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (args[i] === "--output" && outputDir === undefined) {
      if (!args[i + 1] || args[i + 1].startsWith("--")) { usageError = "--output requires a new directory path"; break; }
      outputDir = args[++i];
    } else { usageError = `Unknown or repeated turn-demo option: ${args[i]}`; break; }
  }
  if (usageError) {
    process.stderr.write(`${usageError}\n`);
    process.exitCode = 2;
  } else {
    try {
      const { runTurnRecoveryDemo } = await import("./turn-demo.js");
      const result = await runTurnRecoveryDemo({ outputDir,
        log: json ? () => {} : line => process.stdout.write(`${line}\n`) });
      process.stdout.write(`TURN_RECOVERY_RESULT ${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stderr.write(`Recovery demo failed: ${error.message}\n`);
      process.exitCode = 1;
    }
  }
} else if (command === "init-adapter") {
  const target = path.resolve(process.cwd(), process.argv[3] || "mission-gate-adapter.mjs");
  const template = new URL("../examples/provider-gate-adapter.mjs", import.meta.url);
  try {
    fs.copyFileSync(template, target, fs.constants.COPYFILE_EXCL);
    process.stdout.write(`Created ${target}\n`);
  } catch (error) {
    if (error?.code === "EEXIST") {
      process.stderr.write(`Refusing to overwrite existing file: ${target}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
} else if (command === "conformance") {
  const adapterArgument = process.argv.slice(3).find((argument) => argument !== "--json");
  if (!adapterArgument) {
    process.stderr.write("Adapter path required. Example: trust-graduation conformance ./mission-gate-adapter.mjs --json\n");
    process.exitCode = 2;
  } else {
    const adapterPath = path.resolve(process.cwd(), adapterArgument);
    const adapter = await import(pathToFileURL(adapterPath).href);
    const result = await runProviderGateConformance({ createGate: adapter.createGate });
    process.stdout.write(`CONFORMANCE_RESULT ${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
  }
} else if (command === "stagehand-demo") {
  try {
    await import(new URL("../examples/stagehand-local-browser-gate.mjs", import.meta.url).href);
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" &&
      String(error?.message || "").includes("@browserbasehq/stagehand")
    ) {
      process.stderr.write(
        "stagehand-demo requires @browserbasehq/stagehand@4.0.1. " +
        "Run: npx -y --package @trust-graduation/core@beta " +
        "--package @browserbasehq/stagehand@4.0.1 trust-graduation stagehand-demo\n"
      );
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
} else if (command === "--version" || command === "-v") {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  process.stdout.write(`${pkg.version}\n`);
} else {
  process.stderr.write("trust-graduation [demo|turn-demo [--output <new-directory>] [--json]|stagehand-demo|init-adapter [path]|conformance <adapter> [--json]|--version]\n");
  process.exitCode = command === "--help" || command === "-h" ? 0 : 2;
}
