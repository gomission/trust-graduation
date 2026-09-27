// Single-host reference storage. Keep this directory private to the trusted host.
// Immutable revisions use hard-link publication, so SIGKILL cannot leave a
// partially written visible record or a stale lock that needs unsafe stealing.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { digestObject } from "../../src/index.js";

export function createFileTurnStore(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });

  function directory(kind, id) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("invalid_record_id");
    return path.join(root, kind, id);
  }

  function read(kind, id) {
    const dir = directory(kind, id);
    if (!fs.existsSync(dir)) return null;
    const names = fs.readdirSync(dir).filter(name => /^\d{10}\.json$/.test(name)).sort();
    if (!names.length) return null;
    const head = JSON.parse(fs.readFileSync(path.join(dir, names.at(-1)), "utf8"));
    if (`${String(head.revision).padStart(10, "0")}.json` !== names.at(-1)) {
      throw new Error("invalid_journal_revision");
    }
    return { ...head.value, revision: head.revision };
  }

  function commit(kind, id, previousRevision, value) {
    const dir = directory(kind, id);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const revision = previousRevision + 1;
    const final = path.join(dir, `${String(revision).padStart(10, "0")}.json`);
    const temporary = path.join(dir, `.pending-${crypto.randomUUID()}`);
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify({ revision, value }) + "\n");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(temporary, final);
      const dirFd = fs.openSync(dir, "r");
      try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      return true;
    } catch (error) {
      if (error.code === "EEXIST") return false;
      throw error;
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  return Object.freeze({
    get: id => read("requests", id),
    create: (id, value) => commit("requests", id, -1, value),
    compareAndSet: (id, revision, value) => commit("requests", id, revision, value),
    consume(identity) {
      const id = digestObject({ grantId: identity.grantId, issuer: identity.issuer, tenant: identity.tenant }).slice(7);
      return commit("consumed", id, -1, identity)
        ? { ok: true } : { ok: false, reason: "grant_already_consumed" };
    },
    readReceipt: id => read("receipts", id),
    writeReceipt(id, receipt) {
      for (let attempt = 0; attempt < 32; attempt++) {
        const previous = read("receipts", id);
        // A late failed response cannot erase independently confirmed evidence
        // for the same execution. The next-revision commit below retries this
        // check if a concurrent reconciliation wins publication first.
        if (previous?.outcome === "provider_confirmed"
          && receipt.outcome !== "provider_confirmed"
          && previous.actionHash === receipt.actionHash
          && previous.grantId === receipt.grantId) return true;
        if (commit("receipts", id, previous?.revision ?? -1, receipt)) return true;
      }
      throw new Error("receipt_store_contention");
    }
  });
}
