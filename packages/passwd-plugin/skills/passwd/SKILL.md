# passwd

Find and use credentials from your team's passwd.team vault. Credentials are never exposed in chat.

## MCP tools

- `list_secrets` — search and browse secrets (filter by query, type; paginate)
- `get_secret` — view secret details (credential fields show `••••••••`)
- `get_totp_code` — get current TOTP code for 2FA flows
- `get_current_user` — check who is authenticated

## Use credentials

To **use** a credential (e.g. connect to a database, call an API), inject it as an environment variable:

```bash
npx -y @passwd/passwd-agent-cli@1.3.0 exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U user
```

Multiple secrets: add more `--inject VAR=ID:field` flags. Stdout is always masked.

Use `/passwd:use-credential` for guided credential injection.

## Rules

- Manage secrets (create, update, delete, share) in the passwd.team web interface, not in chat
