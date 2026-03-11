import { readFileSync } from "node:fs";

/**
 * Read all of stdin synchronously (fd 0).
 * Strips one trailing newline if present, so `echo "secret" | passwd create --password -` works.
 */
function readStdin(): string {
  const data = readFileSync(0, "utf-8");
  return data.replace(/\r?\n$/, "");
}

/**
 * If value is "-", read from stdin. Otherwise return value as-is.
 * Stdin can only be consumed once — throws if called twice with "-".
 */
let stdinConsumed = false;

export function resolveStdin(value: string | undefined): string | undefined {
  if (value !== "-") return value;
  if (stdinConsumed) {
    throw new Error("Cannot read stdin twice. Only one option can use '-' to read from stdin.");
  }
  stdinConsumed = true;
  return readStdin();
}
