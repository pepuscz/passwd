# @passwd/passwd-cli

Full CLI for [passwd.team](https://passwd.team). It can print raw credential values, so use it in terminals, scripts and CI, not in AI agent integrations (use `@passwd/passwd-agent-cli` there).

## Usage

```bash
export PASSWD_ORIGIN=https://your-company.passwd.team
npx @passwd/passwd-cli login
npx @passwd/passwd-cli list
```

See the [main README](https://github.com/pepuscz/passwd#readme) for setup, the full command reference and security notes.

## License

MIT
