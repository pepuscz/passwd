#!/usr/bin/env node

import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { whoamiCommand } from "./commands/whoami.js";
import { listCommand } from "./commands/list.js";
import { getCommand } from "./commands/get.js";
import { createCommand } from "./commands/create.js";
import { updateCommand } from "./commands/update.js";
import { deleteCommand } from "./commands/delete.js";
import { totpCommand } from "./commands/totp.js";
import { shareCommand } from "./commands/share.js";
import { execCommand } from "./commands/exec.js";
import { groupsCommand } from "./commands/groups.js";
import { contactsCommand } from "./commands/contacts.js";
import { envsCommand } from "./commands/envs.js";
import { resolveCommand } from "./commands/resolve.js";
import { formatError } from "./util/format.js";
import { resetDiscoveryCache, getTokenDir, resolveEnv } from "@passwd/passwd-lib";

const program = new Command();

program
  .name("passwd")
  .description("CLI for passwd.team password manager")
  .version("1.4.2")
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
  .description("Get a secret")
  .option("-f, --field <name>", "Output a single field (raw, no newline)")
  .option("--json", "Output as JSON")
  .action((id, opts) => getCommand(id, opts).catch(die));

program
  .command("create")
  .description("Create a new secret")
  .requiredOption("-t, --type <type>", "Secret type (password, paymentCard, apiCredentials, databaseCredentials, sshKey, secureNote)")
  .requiredOption("-n, --name <name>", "Secret name")
  .option("-u, --username <user>", "Username")
  .option("-p, --password <pass>", "Password (use - for stdin)")
  .option("-w, --web <url>", "Website URL")
  .option("--note <text>", "Note")
  .option("--tags <tags...>", "Tags")
  .option("--group <id:perms>", "Share with group (ID:read,write — repeatable)", collect, undefined)
  .option("--user <id:perms>", "Share with user (ID:read,write — repeatable)", collect, undefined)
  .option("--file <path>", "Attach a file")
  .option("--visible-to-all", "Make visible to all workspace users")
  .option("--totp <secret>", "TOTP secret key (use - for stdin)")
  .option("--card-number <num>", "Card number (use - for stdin)")
  .option("--cvv-code <code>", "CVV code (use - for stdin)")
  .option("--credentials <creds>", "API credentials (use - for stdin)")
  .option("--private-key <key>", "SSH private key (use - for stdin)")
  .option("--public-key <key>", "SSH public key")
  .option("--secure-note <text>", "Secure note content (use - for stdin)")
  .option("--expiration-date <date>", "Card expiration date (MM/YY)")
  .option("--cardholder-name <name>", "Cardholder name")
  .option("--hostname <host>", "API hostname")
  .option("--database-name <name>", "Database name")
  .option("--database-type <type>", "Database type")
  .option("--server <host>", "Database server")
  .option("--port <num>", "Database port")
  .action((opts) => createCommand(opts).catch(die));

program
  .command("update <id>")
  .description("Update a secret")
  .option("-n, --name <name>", "Name")
  .option("-u, --username <user>", "Username")
  .option("-p, --password <pass>", "Password (use - for stdin)")
  .option("-w, --web <url>", "Website URL")
  .option("--note <text>", "Note")
  .option("--tags <tags...>", "Tags")
  .option("--group <id:perms>", "Share with group (ID:read,write — repeatable)", collect, undefined)
  .option("--user <id:perms>", "Share with user (ID:read,write — repeatable)", collect, undefined)
  .option("--file <path>", "Attach a file")
  .option("--remove-file", "Remove existing file attachment")
  .option("--visible-to-all", "Make visible to all workspace users")
  .option("--totp <secret>", "TOTP secret key (use - for stdin)")
  .option("--card-number <num>", "Card number (use - for stdin)")
  .option("--cvv-code <code>", "CVV code (use - for stdin)")
  .option("--credentials <creds>", "API credentials (use - for stdin)")
  .option("--private-key <key>", "SSH private key (use - for stdin)")
  .option("--public-key <key>", "SSH public key")
  .option("--secure-note <text>", "Secure note content (use - for stdin)")
  .option("--expiration-date <date>", "Card expiration date (MM/YY)")
  .option("--cardholder-name <name>", "Cardholder name")
  .option("--hostname <host>", "API hostname")
  .option("--database-name <name>", "Database name")
  .option("--database-type <type>", "Database type")
  .option("--server <host>", "Database server")
  .option("--port <num>", "Database port")
  .action((id, opts) => updateCommand(id, opts).catch(die));

program
  .command("delete <id>")
  .description("Delete a secret (irreversible)")
  .option("-y, --yes", "Skip confirmation prompt")
  .action((id, opts) => deleteCommand(id, opts).catch(die));

program
  .command("totp <id>")
  .description("Get current TOTP code")
  .option("--json", "Output as JSON (includes remaining seconds)")
  .action((id, opts) => totpCommand(id, opts).catch(die));

program
  .command("share <id>")
  .description("Enable or revoke sharing")
  .option("--revoke", "Revoke sharing instead of enabling")
  .option("--json", "Output as JSON")
  .action((id, opts) => shareCommand(id, opts).catch(die));

program
  .command("groups")
  .description("List available groups")
  .option("--json", "Output as JSON")
  .action((opts) => groupsCommand(opts).catch(die));

program
  .command("contacts")
  .description("List available contacts")
  .option("--json", "Output as JSON")
  .action((opts) => contactsCommand(opts).catch(die));

program
  .command("envs")
  .description("List known environments")
  .option("--json", "Output as JSON")
  .action((opts) => envsCommand(opts).catch(die));

program
  .command("resolve", { hidden: true })
  .description("Resolve secrets for exec secrets provider (reads JSON from stdin)")
  .action(() => resolveCommand().catch(die));

program
  .command("exec")
  .description("Run a command with secrets injected as environment variables")
  .option("--inject <mapping...>", "VAR=SECRET_ID:FIELD (repeatable)")
  .option("--no-masking", "Disable stdout masking of secret values")
  .argument("[args...]", "Command to execute (after --)")
  .passThroughOptions()
  .action((args, opts) => {
    execCommand(args, opts).catch(die);
  });

/** Commander repeatable-option accumulator. */
function collect(val: string, prev: string[] | undefined): string[] {
  return prev ? [...prev, val] : [val];
}

function die(err: unknown): void {
  console.error(`Error: ${formatError(err)}`);
  process.exitCode = 1;
}

program.parse();
