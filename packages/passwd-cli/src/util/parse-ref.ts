import type { GroupRef, UserRef } from "@passwd/passwd-lib";

/**
 * Parse a CLI flag value like "ID:read,write" into a ref object.
 * Format: <id>:<perm1>,<perm2>,...
 * Example: "028h4q:read,write" → { id: "028h4q", accessPermissions: ["read", "write"] }
 */
export function parseRefFlag(value: string): GroupRef | UserRef {
  const colonIdx = value.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      `Invalid ref format "${value}". Expected ID:permissions (e.g. "abc123:read,write")`
    );
  }
  const id = value.slice(0, colonIdx);
  const perms = value.slice(colonIdx + 1).split(",").map((p) => p.trim());
  const valid = new Set(["read", "write", "autofillOnly", "passkeyOnly"]);
  for (const p of perms) {
    if (!valid.has(p)) {
      throw new Error(`Invalid permission "${p}". Valid: ${[...valid].join(", ")}`);
    }
  }
  return { id, accessPermissions: perms as ("read" | "write" | "autofillOnly" | "passkeyOnly")[] };
}
