# @passwd/passwd-agent-cli

Agent-safe CLI for [passwd.team](https://passwd.team). No command prints raw credential values: `exec --inject` passes secrets to a subprocess as environment variables and masks them in its output (best-effort, exact values only).

## Usage

```bash
export PASSWD_ORIGIN=https://your-company.passwd.team
npx @passwd/passwd-agent-cli login
npx @passwd/passwd-agent-cli exec --inject DB_PASS=SECRET_ID:password -- psql -h host -U app
```

See the [main README](https://github.com/pepuscz/passwd#readme) for setup, the full command reference and security notes.

## License

MIT
