#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(label, command, args) {
  console.log(`- ${label}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`protocol docs update failed during ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("Trust Graduation protocol update");
run("generate protocol PDF", "python3", ["scripts/generate-protocol-pdf.py"]);
run("run tests", "npm", ["test"]);
run("verify npm package contents", "npm", ["pack", "--dry-run"]);
console.log("Protocol docs update complete");
