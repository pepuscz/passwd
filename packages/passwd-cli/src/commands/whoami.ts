import { getCurrentUser } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";

export async function whoamiCommand(opts: { json?: boolean }): Promise<void> {
  const user = await getCurrentUser();
  if (opts.json) {
    console.log(formatJson(user));
  } else {
    console.log(`${user.name} <${user.email}>`);
  }
}
