import { enableSharing, revokeSharing } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";

export async function shareCommand(
  id: string,
  opts: { revoke?: boolean; json?: boolean },
): Promise<void> {
  if (opts.revoke) {
    await revokeSharing(id);
    console.log(`Sharing revoked for secret ${id}.`);
  } else {
    const result = await enableSharing(id);
    if (opts.json) {
      console.log(formatJson(result));
    } else {
      console.log(`Sharing enabled for secret ${id}.`);
      if (result.shareId) {
        console.log(`Share ID: ${result.shareId}`);
      }
    }
  }
}
