import { decodeSecretFile } from "@passwd/passwd-lib";
import type { Secret, SecretFile } from "@passwd/passwd-lib";

/**
 * Pseudo-field that selects a secret's file attachment. The attachment is
 * decoded from its data URL, so the child process gets the file content,
 * not the transport encoding.
 */
export const FILE_FIELD = "file";

function attachmentOf(secret: Secret, secretId: string): SecretFile {
  const file = (secret as { file?: SecretFile | null }).file;
  if (!file || typeof file.data !== "string") {
    throw new Error(`Secret '${secretId}' has no file attachment`);
  }
  return file;
}

/** Decoded bytes of a secret's file attachment. */
export function resolveFileBytes(secret: Secret, secretId: string): Buffer {
  return decodeSecretFile(attachmentOf(secret, secretId));
}

/**
 * Resolve a field to the string that goes into an environment variable.
 * `file` resolves to the decoded attachment (text only: environment variables
 * cannot hold NUL bytes). Any other non-scalar field is rejected instead of
 * being stringified to "[object Object]".
 */
export function resolveFieldValue(secret: Secret, secretId: string, field: string): string {
  if (field === FILE_FIELD) {
    const bytes = resolveFileBytes(secret, secretId);
    if (bytes.includes(0)) {
      throw new Error(
        `Attachment of secret '${secretId}' is binary: use --inject-file to receive it as a file`,
      );
    }
    return bytes.toString("utf-8");
  }
  const value = (secret as unknown as Record<string, unknown>)[field];
  if (value === undefined) {
    throw new Error(`Field '${field}' not found in secret '${secretId}'`);
  }
  if (value !== null && typeof value === "object") {
    throw new Error(`Field '${field}' of secret '${secretId}' is not a scalar value`);
  }
  return String(value);
}

/**
 * Values to mask in the child's output for one injected secret: the value
 * itself plus, for multi-line values (keys, certificates, config files), each
 * long line, so printing a single line of the file is masked too.
 */
export function maskCandidates(value: string): string[] {
  const candidates = new Set<string>();
  if (value.length > 0) candidates.add(value);
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length >= MIN_MASKED_LINE) candidates.add(trimmed);
  }
  // Longest first, so a whole value is replaced before its own lines.
  return [...candidates].sort((a, b) => b.length - a.length);
}

/** Shorter lines ("apiVersion: v1") are structure, not secret material. */
const MIN_MASKED_LINE = 24;
