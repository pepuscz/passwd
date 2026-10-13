# @passwd/passwd-lib

Core library for [passwd.team](https://passwd.team) used by the passwd CLI, agent CLI and MCP server: OAuth login, encrypted token storage backed by the OS keychain, and the API client.

## Usage

```js
import { listSecrets, getSecret } from "@passwd/passwd-lib";
```

Set `PASSWD_ORIGIN` to your deployment (for example `https://your-company.passwd.team`) and log in once with `@passwd/passwd-cli` or `@passwd/passwd-agent-cli`.

See the [main README](https://github.com/pepuscz/passwd#readme) for setup, the full command reference and security notes.

## License

MIT
