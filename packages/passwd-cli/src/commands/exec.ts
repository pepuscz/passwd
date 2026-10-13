import { spawn } from "node:child_process";
import { getSecret, pipeMasked } from "@passwd/passwd-lib";
import { parseInjection } from "../util/parse-injection.js";

export async function execCommand(
  args: string[],
  opts: { inject?: string[]; masking?: boolean },
): Promise<void> {
  if (!args.length) {
    console.error("Usage: passwd exec --inject VAR=SECRET_ID:FIELD -- command [args...]");
    process.exitCode = 1;
    return;
  }

  const injections = opts.inject ?? [];
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  // Scrub passwd config so the child only gets the specific fields requested
  delete env.PASSWD_ORIGIN;
  delete env.PASSWD_API_URL;
  delete env.PASSWD_CLIENT_ID;

  // Fetch secrets sequentially — the passwd API doesn't handle concurrent
  // requests reliably (second request may get HTML instead of JSON).
  const resolved: { varName: string; value: string }[] = [];
  for (const spec of injections) {
    const { varName, secretId, field } = parseInjection(spec);
    const secret = await getSecret(secretId);
    const value = (secret as unknown as Record<string, unknown>)[field];
    if (value === undefined) {
      throw new Error(`Field '${field}' not found in secret '${secretId}'`);
    }
    resolved.push({ varName, value: String(value) });
  }
  for (const { varName, value } of resolved) {
    env[varName] = value;
  }

  const secretValues = resolved.map((r) => r.value).filter((v) => v.length > 0);

  const [cmd, ...cmdArgs] = args;
  const child = spawn(cmd, cmdArgs, {
    env,
    stdio: opts.masking === false ? "inherit" : ["inherit", "pipe", "pipe"],
  });

  if (opts.masking !== false) {
    pipeMasked(child.stdout, process.stdout, secretValues);
    pipeMasked(child.stderr, process.stderr, secretValues);
  }

  child.on("close", (code) => {
    process.exitCode = code ?? 1;
  });
}
