import { StringDecoder } from "node:string_decoder";
import type { Readable, Writable } from "node:stream";

export const MASK = "<concealed by passwd>";

export interface StreamMasker {
  /** Mask a chunk. Returns the text that is safe to emit now. */
  write(chunk: Buffer | string): string;
  /** Flush whatever is still held back. Call once, when the stream ends. */
  end(): string;
}

/**
 * Length of the longest suffix of `text` that is a proper prefix of one of
 * the secrets. Those characters may be the start of a secret that continues
 * in the next chunk, so they must not be emitted yet.
 */
function pendingSuffixLength(text: string, secrets: readonly string[]): number {
  const maxLen = Math.min(
    text.length,
    secrets.reduce((max, secret) => Math.max(max, secret.length - 1), 0),
  );
  for (let len = maxLen; len > 0; len--) {
    const suffix = text.slice(text.length - len);
    if (secrets.some((secret) => secret.length > len && secret.startsWith(suffix))) {
      return len;
    }
  }
  return 0;
}

/**
 * Replace secrets in `text`, scanning left to right and trying the longest
 * secret first at each position. Matches may only start before `limit`, but
 * may end after it. Returns the masked output and where scanning stopped.
 */
function maskUntil(
  text: string,
  secrets: readonly string[],
  limit: number,
): { out: string; next: number } {
  let out = "";
  let plainStart = 0;
  let i = 0;
  while (i < limit) {
    const hit = secrets.find((secret) => text.startsWith(secret, i));
    if (hit === undefined) {
      i++;
      continue;
    }
    out += text.slice(plainStart, i) + MASK;
    i += hit.length;
    plainStart = i;
  }
  return { out: out + text.slice(plainStart, Math.max(i, limit)), next: Math.max(i, limit) };
}

/**
 * Create a masker for one output stream. Unlike masking each chunk on its
 * own, it catches secrets split across chunk boundaries, and it decodes
 * UTF-8 incrementally so multi-byte characters split across chunks survive.
 *
 * Only the tail that could start a secret is held back, so line-oriented
 * output (for example MCP JSON-RPC messages) is not delayed.
 */
export function createStreamMasker(secretValues: readonly string[]): StreamMasker {
  // Longest first, so a secret that contains another one is masked whole.
  const secrets = [...new Set(secretValues.filter((v) => v.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  const decoder = new StringDecoder("utf8");
  let carry = "";

  const step = (text: string, final: boolean): string => {
    const buf = carry + text;
    const limit = final ? buf.length : buf.length - pendingSuffixLength(buf, secrets);
    const { out, next } = maskUntil(buf, secrets, limit);
    carry = buf.slice(next);
    return out;
  };

  return {
    write: (chunk) => step(typeof chunk === "string" ? chunk : decoder.write(chunk), false),
    end: () => step(decoder.end(), true),
  };
}

/** Mask every secret value in a complete string. */
export function maskSecrets(text: string, secretValues: readonly string[]): string {
  const masker = createStreamMasker(secretValues);
  return masker.write(text) + masker.end();
}

/** Pipe `source` into `target`, masking every secret value on the way. */
export function pipeMasked(
  source: Readable | null,
  target: Writable,
  secretValues: readonly string[],
): void {
  if (!source) return;
  const masker = createStreamMasker(secretValues);
  source.on("data", (chunk: Buffer) => {
    const out = masker.write(chunk);
    if (out) target.write(out);
  });
  source.on("end", () => {
    const out = masker.end();
    if (out) target.write(out);
  });
}
