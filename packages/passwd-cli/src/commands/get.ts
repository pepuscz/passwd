import { getSecret, redactSecret } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";

export async function getCommand(
  id: string,
  opts: { field?: string; json?: boolean },
): Promise<void> {
  const secret = await getSecret(id);

  if (opts.field) {
    // Explicit field extraction — raw value for piping (like op read)
    const value = (secret as unknown as Record<string, unknown>)[opts.field];
    if (value === undefined) {
      process.stderr.write(`Field '${opts.field}' not found\n`);
      process.exitCode = 1;
      return;
    }
    // Raw value, no trailing newline — designed for $() and piping
    process.stdout.write(String(value));
    return;
  }

  // Default: redacted (agent-safe)
  console.log(formatJson(redactSecret(secret)));
}
