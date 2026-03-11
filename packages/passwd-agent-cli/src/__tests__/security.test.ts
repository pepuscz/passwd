import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseInjection } from "../util/parse-injection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bin = resolve(__dirname, "../../dist/index.js");

function run(...args: string[]): string {
  return execFileSync("node", [bin, ...args], {
    encoding: "utf-8",
    env: { ...process.env, PASSWD_ORIGIN: "https://test.passwd.team" },
    timeout: 5000,
  });
}

describe("agent-cli security boundaries", () => {
  it("help lists only safe commands", () => {
    const help = run("--help");
    // Must have these
    for (const cmd of ["login", "whoami", "list", "get", "totp", "exec", "envs"]) {
      assert.ok(help.includes(cmd), `Expected command "${cmd}" in help`);
    }
    // Must NOT have these
    for (const cmd of ["create", "update", "delete", "share", "groups", "contacts", "resolve"]) {
      assert.ok(!help.includes(cmd), `Dangerous command "${cmd}" should not appear in help`);
    }
  });

  it("get command has no --field option", () => {
    const help = run("get", "--help");
    assert.ok(!help.includes("--field"), "get should not have --field option");
  });

  it("exec command has no --no-masking option", () => {
    const help = run("exec", "--help");
    assert.ok(!help.includes("--no-masking"), "exec should not have --no-masking option");
    assert.ok(!help.includes("--masking"), "exec should not have --masking option");
  });

  it("exec --inject blocks dangerous env vars", () => {
    const dangerous = [
      "LD_PRELOAD", "LD_LIBRARY_PATH",
      "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH",
      "NODE_OPTIONS", "PATH", "HOME", "SHELL", "BASH_ENV",
      "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy",
      "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS",
      "PASSWD_ORIGIN", "PASSWD_API_URL", "PASSWD_CLIENT_ID",
    ];
    for (const v of dangerous) {
      assert.throws(
        () => parseInjection(`${v}=id:field`),
        { message: /Blocked environment variable/ },
        `${v} should be blocked`,
      );
    }
  });

  it("exec --inject allows safe env vars", () => {
    for (const v of ["DB_PASSWORD", "API_KEY", "MY_SECRET", "AWS_ACCESS_KEY_ID"]) {
      assert.doesNotThrow(
        () => parseInjection(`${v}=id:field`),
        `${v} should be allowed`,
      );
    }
  });
});
