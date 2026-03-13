# passwd

[passwd.team](https://passwd.team) for AI agents — your agent uses credentials without ever seeing the raw values.

## What it can do

Four tools for different scopes — pick what fits your setup.

| Tool | Can do | Cannot do |
|---|---|---|
| **Desktop extension** | Browse secrets, TOTP, use credentials on your behalf (output masked) | Raw credential output, writes |
| **MCP server** | Browse secrets, view details (redacted), pull TOTP codes | Credential output, writes, exec |
| **Agent CLI** | Browse, TOTP, run commands with credentials (stdout masked) | Raw credential output, writes |
| **Full CLI** | Everything — raw values, create, update, delete, share | — |

## Setup

Pick your platform. In all examples below, replace `https://your-deployment.passwd.team` with your passwd.team deployment URL (default is `https://app.passwd.team`).

| Platform | Section |
|---|---|
| Claude app (macOS) | [Claude](#claude) |
| OpenClaw | [OpenClaw](#openclaw) |
| Any MCP client | [MCP server](#mcp-server) |
| AI agents with shell access | [Agent CLI](#agent-cli) |
| Terminal / scripts / CI | [Full CLI](#full-cli) |

### Claude

Desktop extension (`.mcpb`). Works in both Chat and Cowork tabs of the Claude macOS app. Credentials never reach the AI — all output is masked.

**1. Download** `passwd.mcpb` from the [latest release](https://github.com/pepuscz/passwd/releases).

**2. Install** — double-click the file.

**3. Configure** — enter your deployment URL (default: `https://app.passwd.team`).

**4. Authenticate** — ask Claude to log in. A browser window opens for Google OAuth.

**Connecting to services** — For services with an MCP server, the agent can interact with them directly. Copy the service's MCP configuration into the secret's **note** field and replace credential values with field names (`username`, `password`). Both standard formats work:

```json
{"mcpServers": {"service": {"command": "npx", "args": ["mcp-remote", "https://mcp.example.com/mcp", "--header", "x-email: ${EMAIL}", "--header", "x-pass: ${PASS}"], "env": {"EMAIL": "username", "PASS": "password"}}}}
```

```json
{"url": "https://mcp.example.com/mcp", "headers": {"x-email": "username", "x-pass": "password"}}
```

The agent detects the config and connects automatically.

Example — two messages work best:
1. *"Find my Rohlik credentials in passwd and read the details"*
2. *"Now buy me bananas"*

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
PASSWD_ORIGIN=https://your-deployment.passwd.team npx -y @passwd/passwd-cli@1.5.2 login
```

**2. Add the secrets provider** to `gateway.config.json5`:

```json5
{
  secrets: {
    providers: {
      passwd: {
        source: "exec",
        command: "/usr/local/bin/npx",          // absolute path to npx
        args: ["-y", "@passwd/passwd-cli@1.5.2", "resolve"],
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

Store your API keys as secrets in passwd.team, then use their IDs in the `id` field. Run `npx @passwd/passwd-cli@1.5.2 list` to find them.

#### Agent skill

Let the agent browse your vault, check TOTP codes, and inject credentials into commands — without ever seeing raw credential values.

**1. Authenticate** with the agent-safe CLI:

```bash
PASSWD_ORIGIN=https://your-deployment.passwd.team npx -y @passwd/passwd-agent-cli@1.5.2 login
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

CMD: `npx -y @passwd/passwd-agent-cli@1.5.2`

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

For multiple deployments, log in to each origin separately (`PASSWD_ORIGIN=... npx @passwd/passwd-agent-cli@1.5.2 login`). The agent can then switch with `--env` — see the Multi-environment section in the skill above.

### MCP server

If you just want read-only access to your vault from any MCP-compatible client — browse secrets, view details (credentials redacted), pull TOTP codes — install the MCP server standalone:

```json
{
  "mcpServers": {
    "passwd": {
      "command": "npx",
      "args": ["-y", "@passwd/passwd-mcp@1.5.2"],
      "env": {
        "PASSWD_ORIGIN": "https://your-deployment.passwd.team"
      }
    }
  }
}
```

The MCP server is read-only (no create, update, delete, or share) and credential fields are always redacted. To run commands with credentials, pair it with the agent CLI (`@passwd/passwd-agent-cli`).

### Agent CLI

The agent CLI (`@passwd/passwd-agent-cli`) is a hardened subset of the full CLI — no command can output raw credential values. It adds `exec --inject` for injecting secrets into subprocesses with stdout always masked. Use it with any AI agent that has shell access (Claude Code, Cowork, or any MCP client paired with the MCP server).

```bash
export PASSWD_ORIGIN=https://your-deployment.passwd.team
npx @passwd/passwd-agent-cli@1.5.2 login
npx @passwd/passwd-agent-cli@1.5.2 list
npx @passwd/passwd-agent-cli@1.5.2 exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U app
```

Credentials are injected as environment variables into the child process. Stdout is always masked — if the subprocess prints a secret value, it's replaced with `<concealed by passwd>`. The raw values never enter the AI context.

### Full CLI

The full CLI (`@passwd/passwd-cli`) has complete access to your vault — including raw credential values via `--field` and unmasked output via `--no-masking`. Use it for terminal sessions, scripts, and CI pipelines where you control the environment.

> **For AI agent integrations, use `@passwd/passwd-agent-cli` instead** — it has the same useful commands but no way to output raw credentials.

```bash
export PASSWD_ORIGIN=https://your-deployment.passwd.team
npx @passwd/passwd-cli@1.5.2 login
npx @passwd/passwd-cli@1.5.2 list
npx @passwd/passwd-cli@1.5.2 --help
```

For multiple deployments, log in to each origin separately, then use `--env` to switch:

```bash
PASSWD_ORIGIN=https://acme.passwd.team npx @passwd/passwd-cli@1.5.2 login
PASSWD_ORIGIN=https://initech.passwd.team npx @passwd/passwd-cli@1.5.2 login
npx @passwd/passwd-cli@1.5.2 list --env acme
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

Check [releases](https://github.com/pepuscz/passwd/releases) for new versions, then update the version number in your config — OpenClaw gateway config / SKILL.md, or CLI alias — and restart. The desktop extension updates by installing the new `.mcpb` file.

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

The Claude desktop extension (`passwd.mcpb`) includes all 5 tools above plus:

| Tool | Description |
|---|---|
| `run_with_credentials` | Run a command with secrets injected as env vars (stdout/stderr masked) |
| `connect_mcp_service` | Connect to a remote MCP service using credentials from a secret (MCP config extracted from note field JSON) |
| `call_remote_tool` | Call a tool on a connected remote MCP service (credentials injected as HTTP headers, response masked) |

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
  passwd-mcpb/       Desktop extension for Claude (.mcpb)
  passwd-cli/        Full CLI (depends on passwd-lib)
  passwd-agent-cli/  Agent CLI — no command exposes raw credentials (depends on passwd-lib)
```

## License

MIT
