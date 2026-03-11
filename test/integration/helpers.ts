import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

// Find repo root: walk up from compiled output (test/integration/dist/) to repo root
const __dirname = dirname(fileURLToPath(import.meta.url));
function findRoot(dir: string): string {
  if (existsSync(resolve(dir, "package.json")) && existsSync(resolve(dir, "packages"))) return dir;
  const parent = dirname(dir);
  if (parent === dir) throw new Error("Could not find repo root");
  return findRoot(parent);
}
const ROOT = findRoot(__dirname);

/** Read origin from environments.json or token files in ~/.passwd */
function detectOriginFromTokens(): string | undefined {
  const tokenDir = resolve(homedir(), ".passwd");
  if (!existsSync(tokenDir)) return undefined;

  // Prefer environments.json (works with both encrypted and plaintext tokens)
  const envFile = resolve(tokenDir, "environments.json");
  if (existsSync(envFile)) {
    try {
      const envs = JSON.parse(readFileSync(envFile, "utf-8"));
      if (Array.isArray(envs) && envs.length > 0 && envs[0].origin) {
        return envs[0].origin;
      }
    } catch { /* fall through */ }
  }

  // Fallback: try reading plaintext token files (pre-v1.4.0)
  const files = readdirSync(tokenDir).filter(
    (f) => f.startsWith("tokens-") && f.endsWith(".json"),
  );
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(resolve(tokenDir, file), "utf-8"));
      if (data.origin) return data.origin;
    } catch { /* skip */ }
  }
  return undefined;
}

// Auto-detect PASSWD_ORIGIN from saved tokens if not explicitly set
if (!process.env.PASSWD_ORIGIN) {
  const detected = detectOriginFromTokens();
  if (detected) {
    process.env.PASSWD_ORIGIN = detected;
  }
}

/**
 * Skip the current test unless auth is available (PASSWD_ORIGIN + tokens).
 * Returns true if skipped.
 */
export function skipUnlessAuth(t: { skip: (msg: string) => void }): boolean {
  if (!process.env.PASSWD_ORIGIN) {
    t.skip("No PASSWD_ORIGIN and no saved tokens found");
    return true;
  }
  return false;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Run a CLI binary and return stdout, stderr, exit code. */
export function runCli(
  pkg: "passwd-cli" | "passwd-agent-cli",
  args: string[],
  env?: Record<string, string>,
): RunResult {
  const bin = resolve(ROOT, `packages/${pkg}/dist/index.js`);
  try {
    const stdout = execFileSync("node", [bin, ...args], {
      encoding: "utf-8",
      env: { ...process.env, ...env },
      timeout: 15000,
    });
    return { stdout, stderr: "", code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      code: err.status ?? 1,
    };
  }
}

/** Send a JSON-RPC request to the MCP server over stdio and return the result. */
export function mcpCall(method: string, params: Record<string, unknown> = {}): any {
  const bin = resolve(ROOT, "packages/passwd-mcp/dist/index.js");
  const id = 1;

  // MCP uses JSON-RPC over stdio. We need to send initialize first, then our call.
  const initReq = JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } } });
  const initNotif = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
  const callReq = JSON.stringify({ jsonrpc: "2.0", id, method: `tools/call`, params: { name: method, arguments: params } });
  const input = `${initReq}\n${initNotif}\n${callReq}\n`;

  const stdout = execFileSync("node", [bin], {
    input,
    encoding: "utf-8",
    env: process.env,
    timeout: 15000,
  });

  // Parse all JSON-RPC responses, find our call's response
  const lines = stdout.split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.id === id) {
        if (msg.error) throw new Error(`MCP error: ${JSON.stringify(msg.error)}`);
        return msg.result;
      }
    } catch {
      // skip non-JSON lines
    }
  }
  throw new Error(`No response for request id=${id}. Output: ${stdout}`);
}

function hasReadAccess(s: any): boolean {
  const perms: string[] = s.userPermissions ?? [];
  return perms.includes("read") || perms.includes("write") || perms.includes("owner");
}

/** Auto-detect test secret IDs by listing secrets from the live API. */
function detectSecretIds(): { secretId: string; totpSecretId: string } {
  let secretId = process.env.TEST_SECRET_ID ?? "";
  let totpSecretId = process.env.TEST_TOTP_SECRET_ID ?? "";
  if (secretId && totpSecretId) return { secretId, totpSecretId };

  if (!process.env.PASSWD_ORIGIN) return { secretId, totpSecretId };

  try {
    const { stdout, code } = runCli("passwd-agent-cli", ["list", "--json"]);
    if (code !== 0) return { secretId, totpSecretId };
    const data = JSON.parse(stdout);
    const secrets: any[] = data.secrets ?? [];
    if (!secretId) {
      // Pick a password-type secret we have read access to
      const pw = secrets.find((s: any) => s.type === "password" && hasReadAccess(s));
      if (pw) secretId = pw.id;
    }
    if (!totpSecretId) {
      const totp = secrets.find((s: any) => s.hasTOTP && hasReadAccess(s));
      if (totp) totpSecretId = totp.id;
    }
  } catch { /* detection failed, tests will skip */ }

  return { secretId, totpSecretId };
}

const _detected = detectSecretIds();
export const TEST_SECRET_ID = _detected.secretId;
export const TEST_TOTP_SECRET_ID = _detected.totpSecretId;
