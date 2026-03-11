# passwd

Find and use credentials from your team's passwd.team vault.

## MCP tools

- `list_secrets` — search and browse secrets (filter by query, type; paginate)
- `get_secret` — view secret details
- `get_totp_code` — get current TOTP code for 2FA flows
- `get_current_user` — check who is authenticated

## Use credentials

Inject a credential as an environment variable:

```bash
npx -y @passwd/passwd-agent-cli@1.4.4 exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U user
```

Multiple secrets: add more `--inject VAR=ID:field` flags.

Use `/passwd:use-credential` for guided credential injection.
