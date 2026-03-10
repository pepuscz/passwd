import { listGroups } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";

export async function groupsCommand(opts: { json?: boolean }): Promise<void> {
  const groups = await listGroups();
  if (opts.json) {
    console.log(formatJson(groups));
  } else {
    for (const g of groups) {
      console.log(`${g.id}\t${g.name}\t${g.email}`);
    }
  }
}
