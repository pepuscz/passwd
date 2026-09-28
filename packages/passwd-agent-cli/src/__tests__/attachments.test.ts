import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Secret } from "@passwd/passwd-lib";
import { parseFileInjection } from "../util/parse-injection.js";
import { maskCandidates, resolveFieldValue, resolveFileBytes } from "../util/resolve-field.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = resolve(__dirname, "../../dist/index.js");

const KEY_LINE = "client-key-data: TOP-SECRET-KEY-MATERIAL-0123456789";
const KUBECONFIG = `apiVersion: v1\nusers:\n- name: admin\n  user:\n    ${KEY_LINE}\n`;
const dataUrl = (bytes: Buffer): string => `data:application/octet-stream;base64,${bytes.toString("base64")}`;

const withFile = (bytes: Buffer): Secret => ({
  type: "password",
  name: "kubeconfig",
  password: "pw",
  file: { name: "kubeconfig.prod", data: dataUrl(bytes) },
});

describe("resolveFieldValue", () => {
  it("resolves 'file' to the decoded text attachment", () => {
    assert.equal(resolveFieldValue(withFile(Buffer.from(KUBECONFIG)), "id", "file"), KUBECONFIG);
  });

  it("rejects a binary attachment and points to --inject-file", () => {
    assert.throws(
      () => resolveFieldValue(withFile(Buffer.from([0, 1, 2])), "id", "file"),
      /binary: use --inject-file/,
    );
  });

  it("rejects 'file' when the secret has no attachment", () => {
    const secret: Secret = { type: "password", name: "x", password: "pw", file: null };
    assert.throws(() => resolveFieldValue(secret, "id", "file"), /has no file attachment/);
  });

  it("rejects object fields instead of injecting '[object Object]'", () => {
    const secret = { type: "password", name: "x", groups: [{ id: "g" }] } as unknown as Secret;
    assert.throws(() => resolveFieldValue(secret, "id", "groups"), /not a scalar value/);
  });

  it("still resolves plain fields and reports missing ones", () => {
    const secret = withFile(Buffer.from(KUBECONFIG));
    assert.equal(resolveFieldValue(secret, "id", "password"), "pw");
    assert.throws(() => resolveFieldValue(secret, "id", "nope"), /Field 'nope' not found/);
  });
});

describe("resolveFileBytes", () => {
  it("returns binary attachments byte for byte", () => {
    const raw = Buffer.from([0, 1, 2, 255]);
    assert.deepEqual(resolveFileBytes(withFile(raw), "id"), raw);
  });
});

describe("parseFileInjection", () => {
  it("accepts VAR=SECRET_ID and defaults the field to file", () => {
    assert.deepEqual(parseFileInjection("KUBECONFIG=abc123"), {
      varName: "KUBECONFIG",
      secretId: "abc123",
      field: "file",
    });
  });

  it("accepts an explicit :file field", () => {
    assert.equal(parseFileInjection("KUBECONFIG=abc123:file").field, "file");
  });

  it("rejects any other field", () => {
    assert.throws(() => parseFileInjection("K=abc:password"), /Only the file attachment/);
  });

  it("rejects malformed specs", () => {
    assert.throws(() => parseFileInjection("no-equals"), /Expected VAR=SECRET_ID/);
    assert.throws(() => parseFileInjection("K="), /Expected VAR=SECRET_ID/);
  });

  it("blocks security-sensitive variables", () => {
    for (const name of ["LD_PRELOAD", "PATH", "NODE_OPTIONS", "PASSWD_ORIGIN"]) {
      assert.throws(() => parseFileInjection(`${name}=abc`), /Blocked environment variable/);
    }
  });
});

describe("maskCandidates", () => {
  it("masks the whole value and each long line, longest first", () => {
    const candidates = maskCandidates(KUBECONFIG);
    assert.equal(candidates[0], KUBECONFIG);
    assert.ok(candidates.includes(KEY_LINE));
    for (let i = 1; i < candidates.length; i++) {
      assert.ok(candidates[i - 1].length >= candidates[i].length);
    }
  });

  it("does not mask short structural lines", () => {
    assert.ok(!maskCandidates(KUBECONFIG).includes("apiVersion: v1"));
  });

  it("returns nothing for an empty value", () => {
    assert.deepEqual(maskCandidates(""), []);
  });
});

describe("exec help", () => {
  it("documents --inject-file", () => {
    const help = execFileSync("node", [bin, "exec", "--help"], {
      encoding: "utf-8",
      env: { ...process.env, PASSWD_ORIGIN: "https://test.passwd.team" },
      timeout: 5000,
    });
    assert.ok(help.includes("--inject-file"));
  });
});
