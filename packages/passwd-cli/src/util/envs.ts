import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuthTokens } from "@passwd/passwd-lib";

export interface EnvInfo {
  origin: string;
  file: string;
  savedAt?: number;
}

export async function scanTokenFiles(tokenDir: string): Promise<EnvInfo[]> {
  let files: string[];
  try {
    files = await readdir(tokenDir);
  } catch {
    return [];
  }

  const results: EnvInfo[] = [];
  for (const file of files) {
    if (!file.startsWith("tokens-") || !file.endsWith(".json")) continue;
    try {
      const content = await readFile(join(tokenDir, file), "utf-8");
      const tokens = JSON.parse(content) as AuthTokens;
      if (tokens.origin) {
        results.push({
          origin: tokens.origin,
          file,
          savedAt: tokens.saved_at,
        });
      }
    } catch {
      // skip unreadable/corrupt files
    }
  }
  return results;
}

export async function resolveEnv(
  name: string,
  tokenDir: string,
): Promise<string> {
  const envs = await scanTokenFiles(tokenDir);
  if (envs.length === 0) {
    throw new Error(
      "No known environments. Log in with PASSWD_ORIGIN set first.",
    );
  }

  const lower = name.toLowerCase();
  const matches = envs.filter((e) => e.origin.toLowerCase().includes(lower));

  if (matches.length === 0) {
    const known = envs.map((e) => `  ${e.origin}`).join("\n");
    throw new Error(
      `No environment matching "${name}". Known environments:\n${known}`,
    );
  }
  if (matches.length > 1) {
    const list = matches.map((e) => `  ${e.origin}`).join("\n");
    throw new Error(
      `Ambiguous match for "${name}". Matching environments:\n${list}\nBe more specific.`,
    );
  }
  return matches[0].origin;
}
