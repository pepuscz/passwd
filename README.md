# passwd

[passwd.team](https://passwd.team) for AI agents — your agent uses credentials without ever seeing the raw values.

## What it can do

Three tools for different scopes — pick what fits your setup.

| Tool | Can do | Cannot do |
|---|---|---|
| **MCP server** | Browse secrets, view details (redacted), pull TOTP codes | Credential output, writes, exec |
| **Agent CLI** | All of MCP + inject credentials via `exec`, stdout masked | Raw credential output, writes |
| **Full CLI** | Everything — raw values, create, update, delete, share | — |

## Setup

Pick your platform. In all examples below, replace `https://your-deployment.passwd.team` with your passwd.team deployment URL (default is `https://app.passwd.team`).

| Platform | Section |
|---|---|
| Claude Cowork | [Claude Cowork](#claude-cowork) |
| OpenClaw | [OpenClaw](#openclaw) |
| Any MCP client | [MCP server](#mcp-server) |
| Terminal / scripts / CI | [CLI](#cli) |

### Claude Cowork

The agent can find and use credentials from your passwd.team vault — raw values never enter the AI context.

**1. Install the plugin** — in Cowork, go to **Plugins** and add [`packages/passwd-plugin`](https://github.com/pepuscz/passwd/tree/main/packages/passwd-plugin) from this repository.

**2. Set your deployment URL** — edit `packages/passwd-plugin/.mcp.json` and replace `https://your-deployment.passwd.team` with your passwd.team URL (default is `https://app.passwd.team`).

**3. Restart Cowork.**

Neither the MCP server nor the agent CLI can output raw credential values — exposure is structurally prevented, not just policy-based.

For multiple deployments, add separate MCP server entries in `.mcp.json` with different names and `PASSWD_ORIGIN` values.

### OpenClaw

passwd integrates with [OpenClaw](https://openclaw.ai) as an [exec secrets provider](https://docs.openclaw.ai/gateway/secrets) — credentials are resolved at gateway startup and never reach the agent context.

**1. Set your deployment URL** in `~/.openclaw/.env` and authenticate (one-time — tokens cached in `~/.passwd/`):

```bash
PASSWD_ORIGIN=https://your-deployment.passwd.team npx -y @passwd/passwd-agent-cli@1.3.0 login
```

**2. Add the secrets provider** to `gateway.config.json5`:

```json5
{
  secrets: {
    providers: {
      passwd: {
        source: "exec",
        command: "/usr/local/bin/npx",          // absolute path to npx
        args: ["-y", "@passwd/passwd-agent-cli@1.3.0", "resolve"],
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

Store your API keys as secrets in passwd.team, then use their IDs in the `id` field. Run `npx @passwd/passwd-agent-cli@1.3.0 list` to find them.

**4. Add the skill** at `~/.openclaw/workspace/skills/passwd/SKILL.md`:

````markdown
---
name: passwd
description: "Find and use team credentials safely. Credentials are never exposed in chat."
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

Find and use credentials from your team's passwd.team vault. Always use `--json` for structured output.

CMD: `npx -y @passwd/passwd-agent-cli@1.3.0`

## Commands

Search:    CMD list -q "search term" --json
Info:      CMD get SECRET_ID --json
TOTP code: CMD totp SECRET_ID
Whoami:    CMD whoami --json
Envs:      CMD envs --json

## Use credentials

NEVER read credentials directly. Inject them as env vars:
CMD exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U user
The secret value goes directly to the subprocess — the agent never sees it.
Secret values in stdout are always masked: `<concealed by passwd>`

## Rules

- NEVER attempt to extract raw credential values — they are redacted for security
- Use `exec --inject` to pass credentials to commands
- Manage secrets (create, update, delete, share) in the passwd.team web interface, not in chat

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

For multiple deployments, log in to each origin separately (`PASSWD_ORIGIN=... npx @passwd/passwd-agent-cli@1.3.0 login`). The agent can then switch with `--env` — see the Multi-environment section in the skill above.

### MCP server

If you just want read-only access to your vault from any MCP-compatible client — browse secrets, view details (credentials redacted), pull TOTP codes — install the MCP server standalone:

```json
{
  "mcpServers": {
    "passwd": {
      "command": "npx",
      "args": ["-y", "@passwd/passwd-mcp@1.3.0"],
      "env": {
        "PASSWD_ORIGIN": "https://your-deployment.passwd.team"
      }
    }
  }
}
```

The MCP server is read-only (no create, update, delete, or share) and credential fields are replaced with `••••••••` at the code level — the agent never sees raw values. To inject credentials into commands, pair it with the agent CLI (`@passwd/passwd-agent-cli`).

### CLI

The full CLI (`@passwd/passwd-cli`) has complete access to your vault — including raw credential values via `--field` and unmasked output via `--no-masking`. Use it for terminal sessions, scripts, and CI pipelines where you control the environment.

> **For AI agent integrations, use `@passwd/passwd-agent-cli` instead** — it has the same useful commands but no way to output raw credentials.

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

The MCP server (`@passwd/passwd-mcp`) can be installed standalone — see [MCP server](#mcp-server). It is read-only (no writes) and credential fields are always redacted.

| Tool | Description |
|---|---|
| `passwd_login` | Google OAuth login flow |
| `list_secrets` | Search/list secrets (filter by query, type; paginate) |
| `get_secret` | Get secret details (credentials redacted) |
| `get_totp_code` | Get current TOTP code (ephemeral 30s codes) |
| `get_current_user` | Get authenticated user profile |

## Agent CLI commands reference

The agent CLI (`@passwd/passwd-agent-cli`, binary `passwd-agent`) is a hardened subset of the full CLI — no command outputs raw credential values. Used by Cowork and OpenClaw integrations.

| Command | Description |
|---|---|
| `passwd-agent login` | Authenticate with Google OAuth |
| `passwd-agent whoami` | Show current user |
| `passwd-agent list` | List/search secrets (`-q`, `-t`, `--json`) |
| `passwd-agent get <id>` | Get a secret (always redacted, no `--field`) |
| `passwd-agent totp <id>` | Get current TOTP code |
| `passwd-agent exec` | Run command with secrets as env vars (`--inject VAR=ID:FIELD`, stdout always masked) |
| `passwd-agent envs` | List known environments (`--json`) |
| `passwd-agent --env <name>` | Global flag: target a specific environment by name substring |

## CLI commands reference

The full CLI (`@passwd/passwd-cli`, binary `passwd`) has complete vault access including raw credential output. For AI agent integrations, use the agent CLI above.

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
  passwd-lib/        Core library (types, auth, API — zero dependencies)
  passwd-mcp/        MCP server (depends on passwd-lib)
  passwd-cli/        Full CLI (depends on passwd-lib)
  passwd-agent-cli/  Agent-safe CLI — no command exposes raw credentials (depends on passwd-lib)
  passwd-plugin/     Cowork plugin (MCP config + agent-blind skill)
```

## License

MIT
