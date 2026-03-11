#!/usr/bin/env node

import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { whoamiCommand } from "./commands/whoami.js";
import { listCommand } from "./commands/list.js";
import { getCommand } from "./commands/get.js";
import { totpCommand } from "./commands/totp.js";
import { execCommand } from "./commands/exec.js";
import { envsCommand } from "./commands/envs.js";
import { resolveCommand } from "./commands/resolve.js";
import { formatError } from "./util/format.js";
import { resetDiscoveryCache, getTokenDir, resolveEnv } from "@passwd/passwd-lib";

const program = new Command();

program
  .name("passwd-agent")
  .description("Agent-safe CLI for passwd.team — no command exposes raw credential values")
  .version("1.4.1")
  .enablePositionalOptions()
  .option("--env <name>", "Target a specific environment (substring match against known origins)");

program.hook("preAction", async (thisCommand) => {
  const envName = thisCommand.opts().env as string | undefined;
  if (envName) {
    const origin = await resolveEnv(envName, getTokenDir());
    process.env.PASSWD_ORIGIN = origin;
    resetDiscoveryCache();
  }
});

program
  .command("login")
  .description("Authenticate with Google OAuth")
  .action(() => loginCommand().catch(die));

program
  .command("whoami")
  .description("Show current user")
  .option("--json", "Output as JSON")
  .action((opts) => whoamiCommand(opts).catch(die));

program
  .command("list")
  .description("List secrets")
  .option("-q, --query <text>", "Search by name, username, or URL")
  .option("-t, --type <type>", "Filter by secret type")
  .option("-l, --limit <n>", "Maximum results")
  .option("-o, --offset <n>", "Skip first N results")
  .option("--json", "Output as JSON")
  .action((opts) => listCommand(opts).catch(die));

program
  .command("get <id>")
  .description("Get a secret (credentials always redacted)")
  .option("--json", "Output as JSON")
  .action((id, opts) => getCommand(id, opts).catch(die));

program
  .command("totp <id>")
  .description("Get current TOTP code")
  .option("--json", "Output as JSON (includes remaining seconds)")
  .action((id, opts) => totpCommand(id, opts).catch(die));

program
  .command("exec")
  .description("Run a command with secrets injected as environment variables")
  .option("--inject <mapping...>", "VAR=SECRET_ID:FIELD (repeatable)")
  .argument("[args...]", "Command to execute (after --)")
  .passThroughOptions()
  .action((args, opts) => {
    execCommand(args, opts).catch(die);
  });

program
  .command("envs")
  .description("List known environments")
  .option("--json", "Output as JSON")
  .action((opts) => envsCommand(opts).catch(die));

program
  .command("resolve", { hidden: true })
  .description("Resolve secrets for exec secrets provider (reads JSON from stdin)")
  .action(() => resolveCommand().catch(die));

function die(err: unknown): void {
  console.error(`Error: ${formatError(err)}`);
  process.exitCode = 1;
}

program.parse();
