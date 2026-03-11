# passwd

[passwd.team](https://passwd.team) for AI agents — your agent uses credentials without ever seeing the raw values.

## What it can do

Three tools for different scopes — pick what fits your setup.

| Tool | Can do | Cannot do |
|---|---|---|
| **MCP server** | Browse secrets, view details (redacted), pull TOTP codes | Credential output, writes, exec |
| **Agent CLI** | Browse, TOTP, inject credentials via `exec` (stdout masked) | Raw credential output, writes |
| **Full CLI** | Everything — raw values, create, update, delete, share | — |

## Setup

Pick your platform. In all examples below, replace `https://your-deployment.passwd.team` with your passwd.team deployment URL (default is `https://app.passwd.team`).

| Platform | Section |
|---|---|
| Claude Cowork | [Claude Cowork](#claude-cowork) |
| OpenClaw | [OpenClaw](#openclaw) |
| Any MCP client | [MCP server](#mcp-server) |
| AI agents with shell access | [Agent CLI](#agent-cli) |
| Terminal / scripts / CI | [Full CLI](#full-cli) |

### Claude Cowork

The plugin bundles the MCP server (browse vault, TOTP codes) and an agent CLI skill (`exec --inject`) — your agent gets both.

**1. Install the plugin** — in Cowork, go to **Plugins** and add [`packages/passwd-plugin`](https://github.com/pepuscz/passwd/tree/main/packages/passwd-plugin) from this repository.

**2. Set your deployment URL** — edit `packages/passwd-plugin/.mcp.json` and replace `https://your-deployment.passwd.team` with your passwd.team URL (default is `https://app.passwd.team`).

**3. Restart Cowork.**

Neither the MCP server nor the agent CLI can output raw credential values — exposure is structurally prevented, not just policy-based.

For multiple deployments, add separate MCP server entries in `.mcp.json` with different names and `PASSWD_ORIGIN` values.

### OpenClaw

passwd has two OpenClaw integrations — pick based on where the credential is needed:

- **Config field on the [SecretRef supported list](https://docs.openclaw.ai/reference/secretref-credential-surface)?** → Use the **secrets provider** — the gateway resolves it at startup, the agent never sees it.
- **Runtime credential the agent needs** (database login, deploy key, custom API call)? → Use the **agent skill** — the agent injects it into a command via `exec --inject`, without seeing the raw value.

You can use both together.

| Integration | What it does | Package | Agent sees raw credentials? |
|---|---|---|---|
| **Secrets provider** | Resolves SecretRefs at gateway startup (API keys, tokens) | `passwd-cli` | No — gateway holds them internally |
| **Agent skill** | Lets the agent browse vault, check TOTP, inject creds into commands | `passwd-agent-cli` | No — credentials always redacted or masked |

#### Secrets provider (gateway)

Resolve [SecretRefs](https://docs.openclaw.ai/gateway/secrets#secretref-contract) at gateway startup — API keys, service tokens, and other credentials go into the gateway's internal config and never reach the agent.

**1. Authenticate** (the gateway runs `passwd-cli`, not the agent):

```bash
PASSWD_ORIGIN=https://your-deployment.passwd.team npx -y @passwd/passwd-cli@1.4.4 login
```

**2. Add the secrets provider** to `gateway.config.json5`:

```json5
{
  secrets: {
    providers: {
      passwd: {
        source: "exec",
        command: "/usr/local/bin/npx",          // absolute path to npx
        args: ["-y", "@passwd/passwd-cli@1.4.4", "resolve"],
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

Store your API keys as secrets in passwd.team, then use their IDs in the `id` field. Run `npx @passwd/passwd-cli@1.4.4 list` to find them.

#### Agent skill

Let the agent browse your vault, check TOTP codes, and inject credentials into commands — without ever seeing raw credential values.

**1. Authenticate** with the agent-safe CLI:

```bash
PASSWD_ORIGIN=https://your-deployment.passwd.team npx -y @passwd/passwd-agent-cli@1.4.4 login
```

**2. Add the skill** at `~/.openclaw/workspace/skills/passwd/SKILL.md`:

````markdown
---
name: passwd
description: "Browse team credentials and generate TOTP codes."
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

Browse credentials and generate TOTP codes from your team's passwd.team vault. Always use `--json` for structured output.

CMD: `npx -y @passwd/passwd-agent-cli@1.4.4`

## Commands

Search:    CMD list -q "search term" --json
Info:      CMD get SECRET_ID --json
TOTP code: CMD totp SECRET_ID
Whoami:    CMD whoami --json
Envs:      CMD envs --json

## Use credentials

Inject a credential into a command without exposing it:
CMD exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U user

Multiple secrets: add more `--inject VAR=ID:field` flags.

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

**3. Restart the gateway** so the skill and provider are discovered.

For multiple deployments, log in to each origin separately (`PASSWD_ORIGIN=... npx @passwd/passwd-agent-cli@1.4.4 login`). The agent can then switch with `--env` — see the Multi-environment section in the skill above.

### MCP server

If you just want read-only access to your vault from any MCP-compatible client — browse secrets, view details (credentials redacted), pull TOTP codes — install the MCP server standalone:

```json
{
  "mcpServers": {
    "passwd": {
      "command": "npx",
      "args": ["-y", "@passwd/passwd-mcp@1.4.4"],
      "env": {
        "PASSWD_ORIGIN": "https://your-deployment.passwd.team"
      }
    }
  }
}
```

The MCP server is read-only (no create, update, delete, or share) and credential fields are replaced with `••••••••` at the code level — the agent never sees raw values. To inject credentials into commands, pair it with the agent CLI (`@passwd/passwd-agent-cli`).

### Agent CLI

The agent CLI (`@passwd/passwd-agent-cli`) is a hardened subset of the full CLI — no command can output raw credential values. It adds `exec --inject` for injecting secrets into subprocesses with stdout always masked. Use it with any AI agent that has shell access (Claude Code, Cowork, or any MCP client paired with the MCP server).

```bash
export PASSWD_ORIGIN=https://your-deployment.passwd.team
npx @passwd/passwd-agent-cli@1.4.4 login
npx @passwd/passwd-agent-cli@1.4.4 list
npx @passwd/passwd-agent-cli@1.4.4 exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U app
```

Credentials are injected as environment variables into the child process. Stdout is always masked — if the subprocess prints a secret value, it's replaced with `<concealed by passwd>`. The raw values never enter the AI context.

### Full CLI

The full CLI (`@passwd/passwd-cli`) has complete access to your vault — including raw credential values via `--field` and unmasked output via `--no-masking`. Use it for terminal sessions, scripts, and CI pipelines where you control the environment.

> **For AI agent integrations, use `@passwd/passwd-agent-cli` instead** — it has the same useful commands but no way to output raw credentials.

```bash
export PASSWD_ORIGIN=https://your-deployment.passwd.team
npx @passwd/passwd-cli@1.4.4 login
npx @passwd/passwd-cli@1.4.4 list
npx @passwd/passwd-cli@1.4.4 --help
```

For multiple deployments, log in to each origin separately, then use `--env` to switch:

```bash
PASSWD_ORIGIN=https://acme.passwd.team npx @passwd/passwd-cli@1.4.4 login
PASSWD_ORIGIN=https://initech.passwd.team npx @passwd/passwd-cli@1.4.4 login
npx @passwd/passwd-cli@1.4.4 list --env acme
```

### Passing sensitive values via stdin

For `--password`, `--totp`, `--credentials`, `--private-key`, `--secure-note`, `--card-number`, and `--cvv-code`, pass `-` as the value to read from stdin instead of exposing the value in the process list:

```bash
echo "s3cret" | passwd create -t password -n "My secret" --password -
```

Only one flag can read from stdin per invocation.

### Building from source

```bash
git clone https://github.com/pepuscz/passwd.git
cd passwd
npm install && npm run build
```

Then use `node packages/passwd-mcp/dist/index.js`, `node packages/passwd-agent-cli/dist/index.js`, or `node packages/passwd-cli/dist/index.js` in place of `npx` commands above.

## Upgrading

Check [releases](https://github.com/pepuscz/passwd/releases) for new versions, then update the version number in your config — Cowork plugin `.mcp.json`, OpenClaw gateway config / SKILL.md, or CLI alias — and restart.

## Authentication

Google OAuth2. On first use, the `passwd_login` tool (MCP) or `passwd login` (CLI) will guide you through authentication. Tokens are encrypted at rest on your machine and auto-refresh. Requires macOS Keychain or Linux `secret-tool` (libsecret).

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

## Full CLI commands reference

The full CLI (`@passwd/passwd-cli`, binary `passwd`) has complete vault access including raw credential output. For AI agent integrations, use the agent CLI above.

| Command | Description |
|---|---|
| `passwd login` | Authenticate with Google OAuth |
| `passwd whoami` | Show current user |
| `passwd list` | List/search secrets (`-q`, `-t`, `--json`) |
| `passwd get <id>` | Get a secret (redacted by default; `--field` for raw value) |
| `passwd create` | Create a secret (`-t`, `-n`, `--group`, `--user`, `--file`, `--visible-to-all`, plus type-specific flags — see `--help`) |
| `passwd update <id>` | Update a secret (same flags as create, plus `--remove-file`) |
| `passwd delete <id>` | Delete a secret (`-y` to skip confirmation) |
| `passwd totp <id>` | Get current TOTP code |
| `passwd share <id>` | Enable/revoke sharing (`--revoke`) |
| `passwd groups` | List workspace groups |
| `passwd contacts` | List workspace contacts |
| `passwd envs` | List known environments (`--json`) |
| `passwd resolve` | OpenClaw secrets provider — reads JSON from stdin, writes resolved values to stdout |
| `passwd exec` | Run command with secrets as env vars (`--inject VAR=ID:FIELD`, `--no-masking` to disable stdout masking) |
| `passwd --env <name>` | Global flag: target a specific environment by name substring |

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PASSWD_ORIGIN` | **Yes** | Your passwd.team URL (default `https://app.passwd.team`) |
| `PASSWD_API_URL` | No | API base URL override |
| `PASSWD_CLIENT_ID` | No | Google OAuth client ID override (auto-discovered from deployment) |

## Project structure

```
packages/
  passwd-lib/        Core library (types, auth, API — zero dependencies)
  passwd-mcp/        MCP server (depends on passwd-lib)
  passwd-cli/        Full CLI (depends on passwd-lib)
  passwd-agent-cli/  Agent CLI — no command exposes raw credentials (depends on passwd-lib)
  passwd-plugin/     Cowork plugin (MCP config + agent-blind skill)
```

## License

MIT
