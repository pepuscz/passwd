# @passwd/passwd-mcp

Read-only MCP server for [passwd.team](https://passwd.team). Credential fields are always redacted, so an AI agent can browse the vault without seeing raw values.

## Usage

```json
{
  "mcpServers": {
    "passwd": {
      "command": "npx",
      "args": ["-y", "@passwd/passwd-mcp"],
      "env": { "PASSWD_ORIGIN": "https://your-company.passwd.team" }
    }
  }
}
```

See the [main README](https://github.com/pepuscz/passwd#readme) for setup, the full command reference and security notes.

## License

MIT
