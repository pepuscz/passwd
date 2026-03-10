# passwd

[passwd.team](https://passwd.team) for AI agents — your agent uses credentials without ever seeing the raw values.

## What it can do

- **Use credentials safely** — agent finds the right secret, injects it into a command via `exec --inject`; raw values never enter AI context
- **Pull one-time passwords** — agent gets live TOTP codes from passwd to complete 2FA flows
- **Manage secrets** — search, create, update, delete, share passwords, API keys, SSH keys, and more

## Setup

Pick your platform. In all examples below, replace `https://your-deployment.passwd.team` with your passwd.team deployment URL (default is `https://app.passwd.team`).

| Platform | Section |
|---|---|
| Claude Cowork | [Claude Cowork](#claude-cowork) |
| OpenClaw | [OpenClaw](#openclaw) |
| Terminal / scripts / CI | [CLI](#cli) |

### Claude Cowork

Install the plugin. The agent can find and use credentials from your passwd.team vault — credentials are redacted in all responses and injected into commands via `exec --inject`.

**1. Install the plugin** — in Cowork, go to **Plugins** and add this repository's `packages/passwd-plugin` directory, or copy it into your workspace plugins.

**2. Set your deployment URL** — edit `packages/passwd-plugin/.mcp.json` and replace `https://your-deployment.passwd.team` with your passwd.team URL (default is `https://app.passwd.team`).

**3. Restart Cowork.**

For multiple deployments, add separate MCP server entries in `.mcp.json` with different names and `PASSWD_ORIGIN` values.

### OpenClaw

passwd integrates with [OpenClaw](https://openclaw.ai) as an [exec secrets provider](https://docs.openclaw.ai/gateway/secrets) — credentials are resolved at gateway startup and never reach the agent context. A CLI skill lets the agent find and use credentials via `exec --inject` and manage secrets.

**1. Set your deployment URL** in `~/.openclaw/.env` and authenticate (one-time — tokens cached in `~/.passwd/`):

```bash
PASSWD_ORIGIN=https://your-deployment.passwd.team npx -y @passwd/passwd-cli@1.3.0 login
```

**2. Add the secrets provider** to `gateway.config.json5`:

```json5
{
  secrets: {
    providers: {
      passwd: {
        source: "exec",
        command: "/usr/local/bin/npx",          // absolute path to npx
        args: ["-y", "@passwd/passwd-cli@1.3.0", "resolve"],
        passEnv: ["PASSWD_ORIGIN", "HOME"],
        allowSymlinkCommand: true,              // needed if npx is a symlink (Homebrew)
        trustedDirs: ["/usr/local", "/opt/homebrew"],
      },
    },
  },
}
```

**3. Reference secrets** in model providers using SecretRefs — the `id` is `SECRET_ID:field` (field defaults to `password`):

```json5
{
  models: {
    providers: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        models: [{ id: "gpt-4o", name: "gpt-4o" }],
        apiKey: { source: "exec", provider: "passwd", id: "abc123:password" },
      },
    },
  },
}
```

Store your API keys as secrets in passwd.team, then use their IDs in the `id` field. Run `npx @passwd/passwd-cli@1.3.0 list` to find them.

**4. Add the skill** at `~/.openclaw/workspace/skills/passwd/SKILL.md`:

````markdown
---
name: passwd
description: "Manage team secrets — search, create, update, delete, share. Credentials are never exposed in chat."
metadata:
  {
    "openclaw":
      {
        "emoji": "🔑",
        "requires": { "env": ["PASSWD_ORIGIN"], "bins": ["npx"] },
      },
  }
---

# passwd

Manage team secrets via exec. Always use `--json` for structured output.

CMD: `npx -y @passwd/passwd-cli@1.3.0`

## Commands

Search:    CMD list -q "search term" --json
Info:      CMD get SECRET_ID --json
TOTP code: CMD totp SECRET_ID
Create:    CMD create -t TYPE -n "Name" [-u user] [-p pass] [-w url] [--note text] [--tags t1 t2]
Update:    CMD update SECRET_ID [-n name] [-p pass] [--note text] ...
Delete:    CMD delete SECRET_ID -y
Share:     CMD share SECRET_ID --json
Unshare:   CMD share SECRET_ID --revoke
Groups:    CMD groups --json
Contacts:  CMD contacts --json
Whoami:    CMD whoami --json
Envs:      CMD envs --json

Types: password, apiCredentials, databaseCredentials, sshKey, paymentCard, secureNote

## Use credentials

NEVER read credentials directly. Inject them as env vars:
CMD exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U user
The secret value goes directly to the subprocess — the agent never sees it.
Secret values in stdout are automatically masked: `<concealed by passwd>`

## Sharing

To share a secret with a group or user, first look up the ID:
1. CMD groups --json  OR  CMD contacts --json
2. CMD create ... --group GROUP_ID:read,write  OR  --user USER_ID:read
Permissions: read, write, autofillOnly, passkeyOnly

## Rules

- NEVER use --field to read credential values — use exec --inject instead
- Use --json for all lookups
- ALWAYS confirm with user before deleting secrets

## Multi-environment

Use --env NAME with any command to target a specific passwd.team deployment:
CMD list -q "search" --json --env acme
CMD envs --json

## Display

- Never use tables or code blocks
- Bold label, backtick value: **Username:** `value`
- End credential output with 🔐
- One field per line, skip empty fields
- Lists: name and type only
- TOTP: code and remaining seconds only
````

**5. Restart the gateway** so the skill and provider are discovered.

For multiple deployments, log in to each origin separately (`PASSWD_ORIGIN=... npx @passwd/passwd-cli@1.3.0 login`). The agent can then switch with `--env` — see the Multi-environment section in the skill above.

### CLI

```bash
export PASSWD_ORIGIN=https://your-deployment.passwd.team
npx @passwd/passwd-cli@1.3.0 login
npx @passwd/passwd-cli@1.3.0 list
npx @passwd/passwd-cli@1.3.0 --help
```

For multiple deployments, log in to each origin separately, then use `--env` to switch:

```bash
PASSWD_ORIGIN=https://acme.passwd.team npx @passwd/passwd-cli@1.3.0 login
PASSWD_ORIGIN=https://initech.passwd.team npx @passwd/passwd-cli@1.3.0 login
npx @passwd/passwd-cli@1.3.0 list --env acme
```

### Building from source

```bash
git clone https://github.com/pepuscz/passwd.git
cd passwd
npm install && npm run build
```

Then use `node packages/passwd-mcp/dist/index.js` or `node packages/passwd-cli/dist/index.js` in place of `npx` commands above.

## Upgrading

Check [releases](https://github.com/pepuscz/passwd/releases) for new versions, then update the version number in your config — Cowork plugin `.mcp.json`, OpenClaw gateway config / SKILL.md, or CLI alias — and restart.

## Authentication

Google OAuth2. On first use, the `passwd_login` tool (MCP) or `passwd login` (CLI) will guide you through authentication. Tokens are cached per-environment in `~/.passwd/` and auto-refresh.

Set `PASSWD_ACCESS_TOKEN` env var to skip OAuth entirely.

## MCP tools reference

| Tool | Description |
|---|---|
| `passwd_login` | Google OAuth login flow |
| `list_secrets` | Search/list secrets (filter by query, type; paginate) |
| `get_secret` | Get secret details (credentials redacted) |
| `create_secret` | Create a secret (response redacted; all types, sharing, files) |
| `update_secret` | Update a secret (response redacted) |
| `delete_secret` | Delete a secret |
| `get_totp_code` | Get current TOTP code for a secret |
| `share_secret` | Enable or revoke a share link |
| `get_current_user` | Get authenticated user profile |
| `list_groups` | List workspace groups (IDs for sharing) |
| `list_contacts` | List workspace contacts (IDs for sharing) |

## CLI commands reference

| Command | Description |
|---|---|
| `passwd login` | Authenticate with Google OAuth |
| `passwd whoami` | Show current user |
| `passwd list` | List/search secrets (`-q`, `-t`, `--json`) |
| `passwd get <id>` | Get a secret (redacted by default; `--field` for raw value) |
| `passwd create` | Create a secret (`-t`, `-n`, `--group`, `--user`, `--file`, `--visible-to-all`) |
| `passwd update <id>` | Update a secret (`--group`, `--user`, `--file`, `--remove-file`, `--visible-to-all`) |
| `passwd delete <id>` | Delete a secret (`-y` to skip confirmation) |
| `passwd totp <id>` | Get current TOTP code |
| `passwd share <id>` | Enable/revoke sharing (`--revoke`) |
| `passwd groups` | List workspace groups |
| `passwd contacts` | List workspace contacts |
| `passwd envs` | List known environments (`--json`) |
| `passwd exec` | Run command with secrets as env vars (`--inject VAR=ID:FIELD`, stdout masking) |
| `passwd --env <name>` | Global flag: target a specific environment by name substring |

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PASSWD_ORIGIN` | **Yes** | Your passwd.team URL (default `https://app.passwd.team`) |
| `PASSWD_ACCESS_TOKEN` | No | Skip OAuth — use a pre-existing Bearer token |
| `PASSWD_API_URL` | No | API base URL override |
| `PASSWD_CLIENT_ID` | No | Google OAuth client ID override (auto-discovered from deployment) |

## Project structure

```
packages/
  passwd-lib/      Core library (types, auth, API — zero dependencies)
  passwd-mcp/      MCP server (depends on passwd-lib)
  passwd-cli/      CLI (depends on passwd-lib)
  passwd-plugin/   Cowork plugin (MCP config + agent-blind skill)
```

## License

MIT
