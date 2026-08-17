import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

test("the public core package stays Apache-2.0 and publishable", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
  const license = fs.readFileSync(path.join(repo, "LICENSE"), "utf8");
  const readme = fs.readFileSync(path.join(repo, "README.md"), "utf8");
  const changelog = fs.readFileSync(path.join(repo, "CHANGELOG.md"), "utf8");

  assert.equal(pkg.license, "Apache-2.0");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.publishConfig?.access, "public");
  assert.equal(pkg.files.includes("LICENSE"), true);
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  assert.doesNotMatch(license, /Proprietary License/);
  assert.equal(readme.includes("Core package status: `" + pkg.version + "`"), true);
  assert.equal(changelog.includes("\n## " + pkg.version + " — "), true);
});
