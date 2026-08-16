#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { runProviderGateConformance } from "./conformance.js";
import { runExactKeyDemo } from "./demo.js";

const command = process.argv[2] || "demo";

if (command === "demo") {
  await runExactKeyDemo();
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
} else if (command === "--version" || command === "-v") {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  process.stdout.write(`${pkg.version}\n`);
} else {
  process.stderr.write("trust-graduation [demo|init-adapter [path]|conformance <adapter> [--json]|--version]\n");
  process.exitCode = command === "--help" || command === "-h" ? 0 : 2;
}
