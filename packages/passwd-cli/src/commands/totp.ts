import { getTotpCode } from "@passwd/passwd-lib";
import { formatJson } from "../util/format.js";

export async function totpCommand(
  id: string,
  opts: { json?: boolean },
): Promise<void> {
  const codes = await getTotpCode(id);
  if (opts.json) {
    console.log(formatJson(codes));
  } else {
    // Find the currently valid code
    const now = Math.floor(Date.now() / 1000);
    const current = codes.find((c) => now >= c.validityStart && now < c.validityEnd);
    if (current) {
      const remaining = current.validityEnd - now;
      console.log(`${current.code} (${remaining}s remaining)`);
    } else if (codes.length > 0) {
      // Fallback: show the first code
      console.log(codes[0].code);
    } else {
      console.error("No TOTP codes returned");
      process.exitCode = 1;
    }
  }
}
