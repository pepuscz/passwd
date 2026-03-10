import { listContacts } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";

export async function contactsCommand(opts: { json?: boolean }): Promise<void> {
  const contacts = await listContacts();
  if (opts.json) {
    console.log(formatJson(contacts));
  } else {
    for (const c of contacts) {
      console.log(`${c.id}\t${c.name}\t${c.email}`);
    }
  }
}
