import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { buildOAuthUrl, extractCodeFromRedirectUrl, exchangeCode } from "@passwd/passwd-lib";

export async function loginCommand(): Promise<void> {
  const oauthUrl = await buildOAuthUrl();

  console.log("Open this URL in your browser to authenticate:\n");
  console.log(oauthUrl);
  console.log();

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const redirectUrl = await rl.question("Paste the redirect URL here: ");
    const code = extractCodeFromRedirectUrl(redirectUrl.trim());
    await exchangeCode(code);
    console.log("Authenticated successfully. Token saved to ~/.passwd/");
  } finally {
    rl.close();
  }
}
