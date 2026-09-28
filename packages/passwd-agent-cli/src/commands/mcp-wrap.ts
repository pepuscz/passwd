import { spawn } from "node:child_process";
import { getSecret } from "@passwd/passwd-lib";
import { resolveFieldValue } from "../util/resolve-field.js";

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

/** Escape a string for safe inclusion in a single-quoted shell argument. */
export function shellQuote(s: string): string {
  return "'" + s.replaceAll("'", "'\\''") + "'";
}

/**
 * Build the bash command and env vars for mcp-wrap.
 * Credentials go into env vars (_PASSWD_HDR_N), not into the command string.
 */
export function buildMcpCommand(
  url: string,
  headerNames: string[],
  secretValues: string[],
): { cmd: string; envVars: Record<string, string> } {
  const envVars: Record<string, string> = {};
  const headerParts: string[] = [];
  for (let i = 0; i < headerNames.length; i++) {
    const envVar = `_PASSWD_HDR_${i}`;
    envVars[envVar] = secretValues[i];
    headerParts.push(`--header ${shellQuote(headerNames[i] + ": ")}"\$${envVar}"`);
  }
  const cmd = `npx -y mcp-remote ${shellQuote(url)} ${headerParts.join(" ")}`;
  return { cmd, envVars };
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
    headerNames.push(headerName);
    secretValues.push(resolveFieldValue(secret, secretId, field));
  }

  const { cmd, envVars } = buildMcpCommand(url, headerNames, secretValues);

  const env: Record<string, string> = { ...process.env, ...envVars } as Record<string, string>;
  delete env.PASSWD_ORIGIN;
  delete env.PASSWD_API_URL;
  delete env.PASSWD_CLIENT_ID;

  const child = spawn("bash", ["-c", cmd], {
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });

  const mask = (chunk: Buffer): Buffer => {
    let str = chunk.toString();
    for (const v of secretValues) {
      str = str.replaceAll(v, "<concealed by passwd>");
    }
    return Buffer.from(str);
  };

  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(mask(chunk)));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(mask(chunk)));

  child.on("close", (code) => {
    process.exitCode = code ?? 1;
  });
}
