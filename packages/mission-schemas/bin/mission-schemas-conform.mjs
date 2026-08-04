#!/usr/bin/env node
// Copyright 2026 Phenomena Labs Ltd
// SPDX-License-Identifier: Apache-2.0
//
// mission-schemas-conform: zero-dependency conformance CLI.
//
// Usage:
//   mission-schemas-conform --schema mission-execution-receipt/v2 --file path/to/receipt.json
//   mission-schemas-conform --chain --file path/to/chain.json
//   cat receipt.json | mission-schemas-conform --schema mission-execution-receipt/v2
//
// Emits stable JSON on stdout with exit code 0 on ok, 1 on failure.

import fs from "node:fs";
import { conform, validate, validateReceiptChain, getSchema } from "../src/index.mjs";

function parseArgs(argv) {
  const args = { schema: "", file: "", chain: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--schema") args.schema = argv[++i];
    else if (arg === "--file") args.file = argv[++i];
    else if (arg === "--chain") args.chain = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function readInput(file) {
  const text = file ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");
  return JSON.parse(text);
}

function usage() {
  return [
    "mission-schemas-conform",
    "",
    "Validate a JSON document against a Mission protocol schema, or a full",
    "receipt chain against cross-object reference rules.",
    "",
    "  --schema <id>   Schema identifier or short name (receipt, grant, ...).",
    "  --file <path>   Input file. Reads stdin if omitted.",
    "  --chain         Treat input as a receipt chain (action, grant, decision,",
    "                  policy, payload, receipt) and validate cross-object refs.",
    "",
    "Exit code: 0 on ok, 1 on failure.",
    "",
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) { process.stdout.write(usage()); process.exit(0); }

try {
  const input = readInput(args.file);
  if (args.chain) {
    const report = validateReceiptChain(input);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.ok ? 0 : 1);
  }
  if (!args.schema) {
    process.stderr.write("mission-schemas-conform: --schema is required when --chain is not set\n");
    process.exit(2);
  }
  getSchema(args.schema);
  const report = conform({ target: input, schema: args.schema });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  const payload = { ok: false, errors: [{ path: "", keyword: "fatal", message: error?.message || String(error) }] };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}
