import type { SecretListItem } from "@passwd/passwd-lib";

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatSecretRow(s: SecretListItem): string {
  const parts = [s.id, s.type, s.name];
  if (s.username) parts.push(s.username);
  if (s.web) parts.push(s.web);
  return parts.join("\t");
}
