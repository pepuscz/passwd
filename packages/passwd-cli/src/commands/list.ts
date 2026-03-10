import { listSecrets } from "@passwd/passwd-lib";
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
    console.log(formatJson(result));
  } else {
    console.log(`Total: ${result.totalCount}`);
    for (const s of result.secrets) {
      console.log(formatSecretRow(s));
    }
  }
}
