import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { deleteSecret } from "@passwd/passwd-lib";

export async function deleteCommand(
  id: string,
  opts: { yes?: boolean },
): Promise<void> {
  if (!opts.yes) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      const answer = await rl.question(`Delete secret ${id}? This is irreversible. [y/N] `);
      if (answer.trim().toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
      }
    } finally {
      rl.close();
    }
  }

  await deleteSecret(id);
  console.log(`Deleted secret ${id}.`);
}
