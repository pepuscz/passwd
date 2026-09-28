import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { getSecret } from "@passwd/passwd-lib";
import { parseInjection, parseFileInjection } from "../util/parse-injection.js";
import { maskCandidates, resolveFieldValue, resolveFileBytes } from "../util/resolve-field.js";

export async function execCommand(
  args: string[],
  opts: { inject?: string[]; injectFile?: string[] },
): Promise<void> {
  if (!args.length) {
    console.error(
      "Usage: passwd-agent exec [--inject VAR=SECRET_ID:FIELD] [--inject-file VAR=SECRET_ID] -- command [args...]",
    );
    process.exitCode = 1;
    return;
  }

  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  // Scrub passwd config so the child only gets the specific fields requested
  delete env.PASSWD_ORIGIN;
  delete env.PASSWD_API_URL;
  delete env.PASSWD_CLIENT_ID;

  // Parse every spec before fetching or writing anything: a malformed or
  // blocked spec must not leave a temp file behind.
  const envSpecs = (opts.inject ?? []).map(parseInjection);
  const fileSpecs = (opts.injectFile ?? []).map(parseFileInjection);

  // Fetch secrets sequentially — the passwd API doesn't handle concurrent
  // requests reliably (second request may get HTML instead of JSON).
  const resolved: { varName: string; value: string }[] = [];
  const masked: string[] = [];
  for (const { varName, secretId, field } of envSpecs) {
    const secret = await getSecret(secretId);
    const value = resolveFieldValue(secret, secretId, field);
    resolved.push({ varName, value });
    masked.push(...maskCandidates(value));
  }

  // Attachments go to a private temp dir (0700, files 0600) removed when the
  // child exits: the variable holds the path, never the content.
  let tempDir: string | undefined;
  const cleanup = (): void => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  };
  try {
    for (const [i, { varName, secretId }] of fileSpecs.entries()) {
      const secret = await getSecret(secretId);
      const bytes = resolveFileBytes(secret, secretId);
      tempDir ??= mkdtempSync(join(tmpdir(), "passwd-agent-"));
      const name = basename((secret as { file?: { name?: string } }).file?.name || "attachment");
      const path = join(tempDir, `${i}-${name}`);
      writeFileSync(path, bytes, { mode: 0o600 });
      resolved.push({ varName, value: path });
      if (!bytes.includes(0)) masked.push(...maskCandidates(bytes.toString("utf-8")));
    }
  } catch (err) {
    cleanup();
    throw err;
  }

  for (const { varName, value } of resolved) {
    env[varName] = value;
  }

  const secretValues = [...new Set(masked)].sort((a, b) => b.length - a.length);

  const [cmd, ...cmdArgs] = args;
  // Always mask — no --no-masking flag exists in the agent CLI
  const child = spawn(cmd, cmdArgs, {
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

  // Forward termination to the child so the temp dir is removed on "close";
  // "exit" is the last-resort cleanup if the parent dies first.
  const forward = (signal: NodeJS.Signals): void => {
    child.kill(signal);
  };
  process.on("SIGINT", forward);
  process.on("SIGTERM", forward);
  process.on("exit", cleanup);

  child.on("error", (err) => {
    cleanup();
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });

  child.on("close", (code) => {
    cleanup();
    process.off("SIGINT", forward);
    process.off("SIGTERM", forward);
    process.exitCode = code ?? 1;
  });
}
