import { getTokenDir } from "@passwd/passwd-lib";
import { scanTokenFiles } from "../util/envs.js";

export async function envsCommand(opts: { json?: boolean }): Promise<void> {
  const envs = await scanTokenFiles(getTokenDir());

  if (envs.length === 0) {
    console.log("No known environments. Log in with PASSWD_ORIGIN set first.");
    return;
  }

  const currentOrigin = process.env.PASSWD_ORIGIN?.replace(/\/+$/, "");

  if (opts.json) {
    const out = envs.map((e) => ({
      origin: e.origin,
      current: e.origin === currentOrigin,
      savedAt: e.savedAt,
    }));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  for (const env of envs) {
    const marker = env.origin === currentOrigin ? " *" : "";
    console.log(`${env.origin}${marker}`);
  }
}
