import { listSecrets, redactSecretListItem } from "@passwd/passwd-lib";
import { formatJson, formatSecretRow } from "../util/format.js";

export async function listCommand(opts: {
  query?: string;
  type?: string;
  limit?: string;
  offset?: string;
  json?: boolean;
}): Promise<void> {
  const result = await listSecrets({
    query: opts.query,
    secretType: opts.type,
    limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
    offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
  });

  if (opts.json) {
    // The list endpoint returns full secret objects (attachments included):
    // redact them exactly like `get` does.
    console.log(formatJson({ ...result, secrets: result.secrets.map(redactSecretListItem) }));
  } else {
    console.log(`Total: ${result.totalCount}`);
    for (const s of result.secrets) {
      console.log(formatSecretRow(s));
    }
  }
}
