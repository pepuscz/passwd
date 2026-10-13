import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMapping, buildMcpCommand, MCP_REMOTE_PACKAGE } from "../commands/mcp-wrap.js";

describe("parseMapping", () => {
  it("parses standard header=SECRET_ID:field format", () => {
    const result = parseMapping("x-api-key=abc123:password");
    assert.deepStrictEqual(result, {
      headerName: "x-api-key",
      secretId: "abc123",
      field: "password",
    });
  });

  it("handles header names with multiple hyphens", () => {
    const result = parseMapping("x-custom-auth-token=id:credentials");
    assert.equal(result.headerName, "x-custom-auth-token");
    assert.equal(result.secretId, "id");
    assert.equal(result.field, "credentials");
  });

  it("handles secret IDs with special characters", () => {
    const result = parseMapping("auth=Q7hX-qSC_7rZ:username");
    assert.equal(result.secretId, "Q7hX-qSC_7rZ");
    assert.equal(result.field, "username");
  });

  it("uses first = for split (secret ID can contain =)", () => {
    const result = parseMapping("header=abc=def:password");
    assert.equal(result.headerName, "header");
    assert.equal(result.secretId, "abc=def");
    assert.equal(result.field, "password");
  });

  it("uses first : after = for split (field can't contain :)", () => {
    const result = parseMapping("h=id:field:extra");
    assert.equal(result.secretId, "id");
    assert.equal(result.field, "field:extra");
  });

  it("throws on missing =", () => {
    assert.throws(() => parseMapping("no-equals"), /expected header=SECRET_ID:field/);
  });

  it("throws on missing : after =", () => {
    assert.throws(() => parseMapping("header=no-colon"), /expected header=SECRET_ID:field/);
  });
});

describe("buildMcpCommand", () => {
  it("keeps credentials out of argv and passes them as env vars", () => {
    const { command, args, envVars } = buildMcpCommand(
      "https://mcp.example.com/mcp",
      ["x-api-key", "x-secret"],
      ["supersecretvalue123", "anothersecret456"],
    );
    const argv = [command, ...args].join(" ");
    assert.ok(!argv.includes("supersecretvalue123"), "credential 1 must not appear in argv");
    assert.ok(!argv.includes("anothersecret456"), "credential 2 must not appear in argv");
    assert.equal(envVars._PASSWD_HDR_0, "supersecretvalue123");
    assert.equal(envVars._PASSWD_HDR_1, "anothersecret456");
  });

  it("passes headers as mcp-remote ${VAR} placeholders", () => {
    const { args } = buildMcpCommand(
      "https://mcp.example.com/mcp",
      ["x-api-key", "x-secret"],
      ["a", "b"],
    );
    assert.deepStrictEqual(args.slice(3), [
      "--header", "x-api-key: ${_PASSWD_HDR_0}",
      "--header", "x-secret: ${_PASSWD_HDR_1}",
    ]);
  });

  it("runs an exactly pinned mcp-remote without a shell", () => {
    const { command, args } = buildMcpCommand("https://mcp.example.com/mcp", ["h"], ["v"]);
    assert.equal(command, "npx");
    assert.equal(args[0], "-y");
    assert.equal(args[1], MCP_REMOTE_PACKAGE);
    assert.match(MCP_REMOTE_PACKAGE, /^mcp-remote@\d+\.\d+\.\d+$/);
  });

  it("passes the URL as a single argument, unquoted", () => {
    const { args } = buildMcpCommand("https://mcp.example.com/path with spaces", ["h"], ["v"]);
    assert.equal(args[2], "https://mcp.example.com/path with spaces");
  });

  it("handles single header", () => {
    const { args, envVars } = buildMcpCommand("https://u", ["h"], ["v"]);
    assert.ok(args.includes("h: ${_PASSWD_HDR_0}"));
    assert.equal(Object.keys(envVars).length, 1);
  });

  it("rejects non-HTTPS URLs", () => {
    assert.throws(() => buildMcpCommand("http://example.com/mcp", ["h"], ["v"]), /must use HTTPS/);
  });

  it("rejects a URL that would be read as an mcp-remote option", () => {
    assert.throws(() => buildMcpCommand("--allow-http", ["h"], ["v"]), /must use HTTPS/);
  });
});
