import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { skipUnlessAuth, runCli } from "./helpers.js";

const TOKEN_DIR = resolve(homedir(), ".passwd");

describe("encrypted token storage", () => {
  it("token file exists and contains encrypted blob, not plaintext", (t) => {
    if (skipUnlessAuth(t)) return;
    if (!existsSync(TOKEN_DIR)) { t.skip("No ~/.passwd directory"); return; }

    const files = readdirSync(TOKEN_DIR).filter(
      (f) => f.startsWith("tokens-") && f.endsWith(".json"),
    );
    assert.ok(files.length > 0, "Expected at least one token file");

    for (const file of files) {
      const content = readFileSync(resolve(TOKEN_DIR, file), "utf-8");
      const data = JSON.parse(content);

      // Must have encrypted envelope fields
      assert.equal(data.v, 1, `${file}: expected v:1 envelope`);
      assert.ok(typeof data.iv === "string", `${file}: expected iv field`);
      assert.ok(typeof data.tag === "string", `${file}: expected tag field`);
      assert.ok(typeof data.data === "string", `${file}: expected data field`);

      // Must NOT have plaintext token fields
      assert.equal(data.access_token, undefined, `${file}: access_token must not be in plaintext`);
      assert.equal(data.refresh_token, undefined, `${file}: refresh_token must not be in plaintext`);
      assert.equal(data.origin, undefined, `${file}: origin must not be in plaintext`);
    }
  });

  it("encryption key exists in keychain (macOS)", (t) => {
    if (skipUnlessAuth(t)) return;
    if (process.platform !== "darwin") { t.skip("macOS-only test"); return; }

    let keyHex: string;
    try {
      keyHex = execFileSync("security", [
        "find-generic-password", "-s", "passwd.team", "-a", "encryption-key", "-w",
      ], { encoding: "utf-8", timeout: 5000 }).trim();
    } catch {
      assert.fail("Encryption key not found in keychain");
      return;
    }

    // Must be 64-char hex (256-bit key)
    assert.equal(keyHex.length, 64, "Encryption key should be 64 hex chars");
    assert.match(keyHex, /^[0-9a-f]{64}$/, "Encryption key should be lowercase hex");
  });

  it("environments.json tracks the current origin", (t) => {
    if (skipUnlessAuth(t)) return;
    const origin = process.env.PASSWD_ORIGIN;
    if (!origin) { t.skip("No PASSWD_ORIGIN"); return; }

    const envFile = resolve(TOKEN_DIR, "environments.json");
    assert.ok(existsSync(envFile), "environments.json should exist");

    const envs = JSON.parse(readFileSync(envFile, "utf-8"));
    assert.ok(Array.isArray(envs), "environments.json should be an array");

    const match = envs.find((e: any) => e.origin === origin);
    assert.ok(match, `environments.json should contain ${origin}`);
    assert.ok(typeof match.savedAt === "number", "Entry should have savedAt timestamp");
  });

  it("CLI commands work with encrypted tokens (decrypt round-trip)", (t) => {
    if (skipUnlessAuth(t)) return;
    const { stdout, code } = runCli("passwd-cli", ["whoami", "--json"]);
    assert.equal(code, 0, "whoami should succeed (proves token decryption works)");
    const data = JSON.parse(stdout);
    assert.ok(data.email, "whoami should return an email");
  });

  it("envs command lists known environments", (t) => {
    if (skipUnlessAuth(t)) return;
    const { stdout, code } = runCli("passwd-cli", ["envs", "--json"]);
    assert.equal(code, 0);
    const envs = JSON.parse(stdout);
    assert.ok(Array.isArray(envs), "envs should return an array");
    assert.ok(envs.length > 0, "Should have at least one environment");
    assert.ok(envs[0].origin, "Environment should have origin");
  });
});
