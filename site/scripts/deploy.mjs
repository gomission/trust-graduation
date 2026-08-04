#!/usr/bin/env node
// trustgraduation.org SFTP deploy.
//
// Mirrors the local site dir to the DreamHost remote root via lftp.
// Credentials live in /.credentials/trustgraduation-sftp.json (gitignored).
//
// Usage:
//   node scripts/deploy.mjs           # mirror only newer files
//   node scripts/deploy.mjs --full    # mirror everything (no --only-newer)
//
// Matches the convention used by gomission/scripts/deploy-*-site.mjs.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(new URL("..", import.meta.url).pathname);
const credentialPath = join(root, ".credentials/trustgraduation-sftp.json");
const localSite = root;
const full = process.argv.includes("--full");

const cred = JSON.parse(await readFile(credentialPath, "utf8"));
const required = ["host", "username", "password", "remote_root"];
for (const key of required) {
  if (!cred[key]) throw new Error(`Missing ${key} in ${credentialPath}`);
}

const tempDir = mkdtempSync(join(tmpdir(), "trustgraduation-deploy-"));
const lftpScript = join(tempDir, "deploy.lftp");

const mirrorFlags = ["-R", "--verbose"];
if (!full) mirrorFlags.push("--only-newer");
// Never push the local credentials dir, the deploy script itself,
// or filesystem noise (.DS_Store).
const excludes = [
  "--exclude-glob", ".credentials/",
  "--exclude-glob", "scripts/",
  "--exclude-glob", ".DS_Store",
  "--exclude-glob", "node_modules/",
];

const commands = [
  "set net:timeout 30",
  "set net:max-retries 2",
  "set sftp:auto-confirm yes",
  `open -u ${cred.username},${cred.password} sftp://${cred.host}`,
  `cd ${cred.remote_root}`,
  `mirror ${mirrorFlags.join(" ")} ${excludes.join(" ")} ${localSite}/ ./`,
  "bye",
  "",
].join("\n");

writeFileSync(lftpScript, commands, { mode: 0o600 });

try {
  const result = spawnSync("lftp", ["-f", lftpScript], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Uploaded ${localSite} to ${cred.host}:${cred.remote_root}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
