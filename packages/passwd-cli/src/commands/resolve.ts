import { getSecret } from "@passwd/passwd-lib";

/**
 * OpenClaw exec secrets provider protocol.
 *
 * Reads a JSON request from stdin:
 *   { "protocolVersion": 1, "provider": "passwd", "ids": ["secretId:field", ...] }
 *
 * Writes a JSON response to stdout:
 *   { "protocolVersion": 1, "values": { "secretId:field": "value", ... }, "errors": { "id": "msg", ... } }
 */
export async function resolveCommand(): Promise<void> {
  const input = await readStdin();

  let request: { protocolVersion?: number; ids?: string[] };
  try {
    request = JSON.parse(input);
  } catch {
    writeResponse({}, { _parse: "Invalid JSON on stdin" });
    return;
  }

  const ids = request.ids ?? [];
  if (!Array.isArray(ids) || ids.length === 0) {
    writeResponse({}, {});
    return;
  }

  // Deduplicate secret IDs to minimize API calls
  const secretIds = [...new Set(ids.map((id) => id.split(":")[0]))];
  const secrets = new Map<string, Record<string, unknown>>();
  const fetchErrors = new Map<string, string>();

  const results = await Promise.allSettled(
    secretIds.map(async (sid) => {
      const secret = await getSecret(sid);
      return { sid, secret };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      secrets.set(result.value.sid, result.value.secret as unknown as Record<string, unknown>);
    } else {
      const sid = secretIds[results.indexOf(result)];
      fetchErrors.set(sid, String(result.reason));
    }
  }

  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const id of ids) {
    const [secretId, field = "password"] = id.split(":");
    const fetchError = fetchErrors.get(secretId);
    if (fetchError) {
      errors[id] = fetchError;
      continue;
    }
    const secret = secrets.get(secretId);
    if (!secret) {
      errors[id] = "Secret not found";
      continue;
    }
    const value = secret[field];
    if (value === undefined || value === null) {
      errors[id] = `Field '${field}' not found`;
      continue;
    }
    values[id] = String(value);
  }

  writeResponse(values, errors);
}

function writeResponse(values: Record<string, string>, errors: Record<string, string>): void {
  const response: Record<string, unknown> = { protocolVersion: 1, values };
  if (Object.keys(errors).length > 0) {
    response.errors = errors;
  }
  process.stdout.write(JSON.stringify(response) + "\n");
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });
}
