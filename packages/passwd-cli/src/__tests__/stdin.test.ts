import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * resolveStdin reads fd 0 synchronously, which can't be mocked in-process.
 * Instead we test via a small inline script that imports resolveStdin and
 * exercises it with controlled stdin.
 */

const stdinUtil = resolve(__dirname, "../util/stdin.js");

function runWithStdin(script: string, stdin = ""): string {
  return execFileSync("node", ["--input-type=module", "-e", script], {
    encoding: "utf-8",
    input: stdin,
    timeout: 5000,
  });
}

describe("resolveStdin", () => {
  it("returns value as-is when not '-'", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin("hello")));
    `;
    assert.equal(JSON.parse(runWithStdin(script)), "hello");
  });

  it("returns undefined for undefined input", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin(undefined)));
    `;
    // JSON.stringify(undefined) is undefined, but console.log prints "undefined"
    // So we use a wrapper
    const script2 = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      const r = resolveStdin(undefined);
      console.log(r === undefined ? "UNDEF" : r);
    `;
    assert.equal(runWithStdin(script2).trim(), "UNDEF");
  });

  it("reads from stdin when value is '-'", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin("-")));
    `;
    assert.equal(JSON.parse(runWithStdin(script, "my-secret-value\n")), "my-secret-value");
  });

  it("strips trailing newline from stdin", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin("-")));
    `;
    assert.equal(JSON.parse(runWithStdin(script, "value\n")), "value");
  });

  it("strips trailing CRLF from stdin", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin("-")));
    `;
    assert.equal(JSON.parse(runWithStdin(script, "value\r\n")), "value");
  });

  it("preserves value with no trailing newline", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin("-")));
    `;
    assert.equal(JSON.parse(runWithStdin(script, "exact")), "exact");
  });

  it("preserves internal newlines", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin("-")));
    `;
    assert.equal(JSON.parse(runWithStdin(script, "line1\nline2\n")), "line1\nline2");
  });

  it("throws on second stdin read", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      resolveStdin("-");
      try {
        resolveStdin("-");
        console.log("NO_ERROR");
      } catch (e) {
        console.log(e.message);
      }
    `;
    const output = runWithStdin(script, "data").trim();
    assert.ok(output.includes("Cannot read stdin twice"), `Got: ${output}`);
  });

  it("does not treat literal dash in non-stdin value specially", () => {
    const script = `
      import { resolveStdin } from ${JSON.stringify(stdinUtil)};
      console.log(JSON.stringify(resolveStdin("--not-stdin")));
    `;
    assert.equal(JSON.parse(runWithStdin(script)), "--not-stdin");
  });
});
