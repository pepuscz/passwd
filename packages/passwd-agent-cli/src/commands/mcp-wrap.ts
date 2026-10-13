import { spawn } from "node:child_process";
import { getSecret, pipeMasked, requireHttps } from "@passwd/passwd-lib";

interface HeaderMapping {
  headerName: string;
  secretId: string;
  field: string;
}

export function parseMapping(spec: string): HeaderMapping {
  const eqIdx = spec.indexOf("=");
  if (eqIdx === -1) {
    throw new Error(`Invalid mapping "${spec}" — expected header=SECRET_ID:field`);
  }
  const headerName = spec.slice(0, eqIdx);
  const rest = spec.slice(eqIdx + 1);
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(`Invalid mapping "${spec}" — expected header=SECRET_ID:field`);
  }
  return {
    headerName,
    secretId: rest.slice(0, colonIdx),
    field: rest.slice(colonIdx + 1),
  };
}

/**
 * mcp-remote is pinned to an exact version: it runs with vault secrets in its
 * environment, so it must not float to whatever is latest on npm.
 */
export const MCP_REMOTE_PACKAGE = "mcp-remote@0.14.3";

/**
 * Build the mcp-remote invocation and env vars for mcp-wrap.
 * Credentials go into env vars (_PASSWD_HDR_N). The header arguments only
 * carry `${_PASSWD_HDR_N}` placeholders, which mcp-remote expands from its
 * own environment, so the values never appear in any process's argv.
 * No shell is involved, so the URL and header names need no quoting. The
 * URL must be HTTPS (or local http), which also stops it from being read as
 * an mcp-remote option.
 */
export function buildMcpCommand(
  url: string,
  headerNames: string[],
  secretValues: string[],
): { command: string; args: string[]; envVars: Record<string, string> } {
  requireHttps(url, "mcp-wrap URL");
  const envVars: Record<string, string> = {};
  const headerArgs: string[] = [];
  for (let i = 0; i < headerNames.length; i++) {
    const envVar = `_PASSWD_HDR_${i}`;
    envVars[envVar] = secretValues[i];
    headerArgs.push("--header", `${headerNames[i]}: \${${envVar}}`);
  }
  return {
    command: "npx",
    args: ["-y", MCP_REMOTE_PACKAGE, url, ...headerArgs],
    envVars,
  };
}

export async function mcpWrapCommand(
  url: string,
  mappings: string[],
): Promise<void> {
  // Resolve all header mappings sequentially.
  const headerNames: string[] = [];
  const secretValues: string[] = [];

  for (const spec of mappings) {
    const { headerName, secretId, field } = parseMapping(spec);
    const secret = await getSecret(secretId);
    const value = (secret as unknown as Record<string, unknown>)[field];
    if (value === undefined) {
      throw new Error(`Field '${field}' not found in secret '${secretId}'`);
    }
    headerNames.push(headerName);
    secretValues.push(String(value));
  }

  const { command, args, envVars } = buildMcpCommand(url, headerNames, secretValues);

  const env: Record<string, string> = { ...process.env, ...envVars } as Record<string, string>;
  delete env.PASSWD_ORIGIN;
  delete env.PASSWD_API_URL;
  delete env.PASSWD_CLIENT_ID;

  const child = spawn(command, args, {
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  pipeMasked(child.stdout, process.stdout, secretValues);
  pipeMasked(child.stderr, process.stderr, secretValues);

  child.on("close", (code) => {
    process.exitCode = code ?? 1;
  });
}
