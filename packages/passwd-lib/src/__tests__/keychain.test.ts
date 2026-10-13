import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isKeychainAvailable,
  keychainLoad,
  keychainSave,
  resetKeychainCache,
  securityAddCommand,
} from "../keychain.js";

afterEach(() => {
  resetKeychainCache();
});

describe("keychain (unit)", () => {
  it("isKeychainAvailable returns boolean", async () => {
    const result = await isKeychainAvailable();
    assert.equal(typeof result, "boolean");
  });

  it("isKeychainAvailable caches result", async () => {
    const first = await isKeychainAvailable();
    const second = await isKeychainAvailable();
    assert.equal(first, second);
  });

  it("keychainLoad returns null for nonexistent entry", async () => {
    const result = await keychainLoad("https://nonexistent.example.com");
    // On macOS with keychain: null (not found). On CI/Linux: null (unavailable).
    assert.equal(result, null);
  });

  it("keychainSave returns false when keychain unavailable", async () => {
    if (process.platform === "darwin") return; // skip on macOS where keychain IS available
    const result = await keychainSave("https://test.example.com", "{}");
    assert.equal(result, false);
  });
});

describe("securityAddCommand", () => {
  it("builds an add-generic-password line with quoted arguments", () => {
    assert.equal(
      securityAddCommand("passwd.team", "encryption-key", "deadbeef"),
      'add-generic-password -s "passwd.team" -a "encryption-key" -w "deadbeef" -U\n',
    );
  });

  it("escapes quotes and backslashes", () => {
    assert.equal(
      securityAddCommand("svc", 'a"b\\c', "v"),
      'add-generic-password -s "svc" -a "a\\"b\\\\c" -w "v" -U\n',
    );
  });

  it("rejects line breaks that would inject another command", () => {
    assert.throws(
      () => securityAddCommand("svc", "acct", "v\ndelete-keychain"),
      /line breaks/,
    );
  });

  it("round-trips through `security -i` without putting the value in argv", {
    skip: process.platform !== "darwin",
  }, () => {
    const dir = mkdtempSync(join(tmpdir(), "passwd-kc-"));
    const keychain = join(dir, "test.keychain-db");
    try {
      execFileSync("security", ["create-keychain", "-p", "test", keychain]);
      const value = 'v@l "with" \\ quotes $HOME';
      const line = securityAddCommand("passwd.test", "acct one", value)
        .replace(/\n$/, ` "${keychain}"\n`);
      execFileSync("security", ["-i"], { input: line });
      const stored = execFileSync(
        "security",
        ["find-generic-password", "-s", "passwd.test", "-a", "acct one", "-w", keychain],
        { encoding: "utf-8" },
      );
      assert.equal(stored.trim(), value);
    } finally {
      try {
        execFileSync("security", ["delete-keychain", keychain]);
      } catch {
        // already gone
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
