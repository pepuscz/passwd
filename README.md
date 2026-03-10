# passwd

MCP server + CLI for [passwd.team](https://passwd.team) password manager.

Gives your AI assistant full access to your team's passwords, TOTP codes, secure notes, and file attachments — create, read, update, delete, and share secrets through natural language.

## What it can do

- **Search & retrieve** passwords, API keys, SSH keys, payment cards, secure notes
- **Create & update** secrets with all field types
- **Generate TOTP codes** on demand
- **Share secrets** with groups or individual users, with granular permissions (read, write, autofillOnly, passkeyOnly)
- **Attach files** to secrets (certificates, configs, etc.)
- **List groups & contacts** in your workspace for easy sharing

## Install

No build step needed — `npx` downloads and runs the package automatically from [npm](https://www.npmjs.com/org/passwd).

## Setup

In all examples below, replace `https://your-company.passwd.team` with your passwd.team deployment URL.

| Client | Method | Section |
|---|---|---|
| Claude Code | MCP server | [Claude Code](#claude-code) |
| Claude Desktop / Cowork | MCP server | [Claude Desktop / Cowork](#claude-desktop--cowork) |
| Cursor / Windsurf | MCP server | [Cursor / Windsurf](#cursor--windsurf) |
| OpenClaw | CLI workspace skill | [OpenClaw](#openclaw) |
| OpenClaw (secrets provider) | Exec provider for SecretRefs | [Secrets provider](#secrets-provider-optional) |
| Terminal / scripts / CI | CLI directly | [CLI](#cli) |

### Claude Code

```bash
claude mcp add passwd-mcp \
  -e PASSWD_ORIGIN=https://your-company.passwd.team \
  -- npx -y @passwd/passwd-mcp@1.1.0
```

Restart Claude Code and verify with `/mcp`.

### Claude Desktop / Cowork

Open **Settings → Developer → Edit Config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "passwd-mcp": {
      "command": "npx",
      "args": ["-y", "@passwd/passwd-mcp@1.1.0"],
      "env": {
        "PASSWD_ORIGIN": "https://your-company.passwd.team"
      }
    }
  }
}
```

Restart Claude Desktop.

### Cursor / Windsurf

Add to your project's `.cursor/mcp.json` or `.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "passwd-mcp": {
      "command": "npx",
      "args": ["-y", "@passwd/passwd-mcp@1.1.0"],
      "env": {
        "PASSWD_ORIGIN": "https://your-company.passwd.team"
      }
    }
  }
}
```

### OpenClaw

Integrates as a [workspace skill](https://docs.openclaw.ai/tools/skills) using passwd-cli via `exec`. No plugins required.

**1. Set your deployment URL** in `~/.openclaw/.env`:

```
PASSWD_ORIGIN=https://your-company.passwd.team
```

**2. Authenticate** (one-time — tokens cached in `~/.passwd/`):

```bash
npx -y @passwd/passwd-cli@1.1.0 login
```

**3. Create the skill** at `~/.openclaw/workspace/skills/passwd/SKILL.md`:

````markdown
---
name: passwd
description: "Team password manager (passwd.team). Search, create, update, delete, and share passwords, API keys, SSH keys, payment cards, TOTP codes, and secure notes."
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

CMD: `npx -y @passwd/passwd-cli@1.1.0`

## Commands

Search:    CMD list -q "search term" --json
Get:       CMD get SECRET_ID --json
Password:  CMD get SECRET_ID --field password
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

## Sharing

To share a secret with a group or user, first look up the ID:
1. CMD groups --json  OR  CMD contacts --json
2. CMD create ... --group GROUP_ID:read,write  OR  --user USER_ID:read
Permissions: read, write, autofillOnly, passkeyOnly

## Run with injected secrets

First find the secret ID with `CMD list`, then inject its field as an env var:
CMD exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U user

## Rules

- ALWAYS confirm with user before deleting secrets
- Use --json for all lookups so you get structured data
- Run CMD create --help or CMD update --help for all options
- Do NOT show passwords or secrets in chat unless the user explicitly asks

## Multi-environment

Use --env NAME with any command to target a specific passwd.team deployment:
CMD list -q "search" --json --env prod
CMD envs --json

## Display

- Never use tables or code blocks
- Bold label, backtick value: **Username:** `value`
- End credential output with 🔐
- One field per line, skip empty fields
- Lists: name and type only
- TOTP: code and remaining seconds only
````

**4. Restart the gateway** so the skill is discovered on the next session.

#### Secrets provider (optional)

Use passwd as an [exec secrets provider](https://docs.openclaw.ai/gateway/secrets) to inject passwd.team credentials into model provider configs without exposing them in plaintext.

```bash
openclaw secrets configure
# Select provider type: exec
# Command: /path/to/npx (or node packages/passwd-cli/dist/index.js)
# Args: -y @passwd/passwd-cli@1.1.0 resolve
# passEnv: PASSWD_ORIGIN, HOME
```

SecretRef format — the id is `SECRET_ID:field` (field defaults to `password`):
```json
"apiKey": {"source": "exec", "provider": "passwd", "id": "abc123:password"}
```

### CLI

```bash
export PASSWD_ORIGIN=https://your-company.passwd.team
npx @passwd/passwd-cli@1.1.0 login
npx @passwd/passwd-cli@1.1.0 list
npx @passwd/passwd-cli@1.1.0 --help
```

### Building from source

```bash
git clone https://github.com/pepuscz/passwd.git
cd passwd
npm install && npm run build
```

Then use `node packages/passwd-mcp/dist/index.js` or `node packages/passwd-cli/dist/index.js` in place of `npx` commands above.

## Upgrading

Check [releases](https://github.com/pepuscz/passwd/releases) for new versions, then update the version number in your config — MCP config, OpenClaw SKILL.md, or CLI alias — and restart the client.

## Authentication

Google OAuth2. On first use, the `passwd_login` tool (MCP) or `passwd login` (CLI) will guide you through authentication. Tokens are cached per-environment in `~/.passwd/` and auto-refresh.

Set `PASSWD_ACCESS_TOKEN` env var to skip OAuth entirely.

## MCP tools reference

| Tool | Description |
|---|---|
| `passwd_login` | Google OAuth login flow |
| `list_secrets` | Search/list secrets (filter by query, type; paginate) |
| `get_secret` | Get full secret details including password |
| `create_secret` | Create a secret (all types, with sharing, files, visibleToAll) |
| `update_secret` | Update a secret |
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
| `passwd get <id>` | Get a secret (`--field` for raw value) |
| `passwd create` | Create a secret (`-t`, `-n`, `--group`, `--user`, `--file`, `--visible-to-all`) |
| `passwd update <id>` | Update a secret (`--group`, `--user`, `--file`, `--remove-file`, `--visible-to-all`) |
| `passwd delete <id>` | Delete a secret (`-y` to skip confirmation) |
| `passwd totp <id>` | Get current TOTP code |
| `passwd share <id>` | Enable/revoke sharing (`--revoke`) |
| `passwd groups` | List workspace groups |
| `passwd contacts` | List workspace contacts |
| `passwd envs` | List known environments (`--json`) |
| `passwd exec` | Run command with secrets as env vars (`--inject VAR=ID:FIELD`) |
| `passwd --env <name>` | Global flag: target a specific environment by name substring |

## Configuration

| Variable | Required | Description |
|---|---|---|
| `PASSWD_ORIGIN` | **Yes** | Your passwd.team URL (e.g. `https://your-company.passwd.team`) |
| `PASSWD_ACCESS_TOKEN` | No | Skip OAuth — use a pre-existing Bearer token |
| `PASSWD_API_URL` | No | API base URL override |
| `PASSWD_CLIENT_ID` | No | Google OAuth client ID override (auto-discovered from deployment) |

## Project structure

```
packages/
  passwd-lib/   Core library (types, auth, API — zero dependencies)
  passwd-mcp/   MCP server (depends on passwd-lib)
  passwd-cli/   CLI (depends on passwd-lib)
```

## License

MIT
