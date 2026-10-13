# passwd

Monorepo with four npm packages + one desktop extension for [passwd.team](https://passwd.team):

- **passwd-lib** — core library (auth, API client, types). Zero dependencies.
- **passwd-mcp** — MCP server for AI assistants. Depends on passwd-lib, @modelcontextprotocol/sdk, zod.
- **passwd-mcpb** — Desktop extension for Claude (.mcpb). All 8 tools including credential injection and MCP proxy. Depends on passwd-lib, @modelcontextprotocol/sdk, zod.
- **passwd-cli** — full CLI tool. Depends on passwd-lib, commander.
- **passwd-agent-cli** — agent-safe CLI (no command exposes raw credentials). Depends on passwd-lib, commander.

## Build

```bash
npm install          # links workspaces
npm run build        # tsc -b (builds lib first, then mcp + cli)
npm run clean        # tsc -b --clean
```

## Project structure

```
packages/
  passwd-lib/src/        types.ts, auth.ts, api.ts, index.ts (barrel)
  passwd-mcp/src/        index.ts (MCP server with 5 read-only tools)
  passwd-mcpb/src/       index.ts (desktop extension with 8 tools including run_with_credentials and MCP proxy)
  passwd-cli/src/        index.ts (commander), commands/*.ts, util/format.ts
  passwd-agent-cli/src/  index.ts (commander, 8 safe commands), commands/*.ts, util/
```

## Key design decisions

- npm workspaces with TypeScript project references (`composite: true`, `tsc -b`)
- passwd-lib has zero npm dependencies — only Node.js built-ins
- Client-side filtering: the passwd API returns all secrets at once. Filtering/pagination is done in `listSecrets()`. MCP defaults to limit 50, CLI defaults to no limit.
- `passwd get <id> --field password` outputs raw value with no trailing newline (for `$()` piping)
- `passwd exec --inject VAR=ID:FIELD` fetches secrets in parallel, execs child with `stdio: inherit`
- Token storage uses VS Code pattern: one AES-256-GCM encryption key stored in platform keychain (macOS `security` CLI / Linux `secret-tool` via libsecret), account `encryption-key`. Encrypted token blobs stored as files at `~/.passwd/tokens-{hash}.json`. Format: `{v:1, iv, tag, data}` hex-encoded. Keychain key created on first `saveTokens()`, shared across environments. `deleteTokens()` removes the file but not the key. Linux `secret-tool store` reads value via stdin (no process list exposure). No env var bypass — keychain is required. Zero npm dependencies maintained (`node:crypto` built-in).

## Required env var

`PASSWD_ORIGIN` — your passwd deployment URL (e.g. `https://your-company.passwd.team`)

## Authentication

Google OAuth2. Tokens encrypted at rest at `~/.passwd/tokens-<hash>.json` (AES-256-GCM, key in platform keychain). Auto-refreshes on 401. Requires macOS Keychain or Linux secret-tool.

## Tests

```bash
npm test                    # unit tests (no network)
npm run test:integration    # integration tests (live API)
npm run test:all            # both
```

**Unit tests** live in `packages/*/src/__tests__/*.test.ts` — pure logic, no network. Uses `node:test` + `node:assert/strict`.

**Integration tests** live in `test/integration/*.test.ts` — hit a live passwd.team deployment. Auto-detect `PASSWD_ORIGIN` and test secret IDs from `~/.passwd/` tokens. Skip gracefully when no auth is available.

### When to update tests

- **New command or tool** → add integration test covering its happy path
- **New option on existing command** → add integration test; if it's agent-cli, add security boundary test confirming dangerous options are absent
- **Changed filtering/parsing/formatting logic** → update or add unit test
- **New sensitive field** → add case to `redact.test.ts`
- **Bug fix** → add regression test reproducing the bug

Run `npm test` before every commit. Integration tests before release.

## Release process

1. `bash scripts/bump-version.sh OLD_VERSION NEW_VERSION` — updates all 11 files and verifies no old version remains
2. `npm install` — regenerate lockfile
3. `npm run build` — verify it compiles
4. `npm test` — run unit tests. **All must pass.**
5. `PASSWD_ORIGIN=https://ackee-be-dev.passwd.team npm run test:integration` — run integration tests against the dev deployment. **All must pass** (skips are OK). Do not release if any test fails.
6. Commit, push — GitHub Action auto-publishes all four npm packages on push to main
7. `gh release create vX.Y.Z --title "vX.Y.Z — Short label" --generate-notes` — this creates a tag, which triggers a second CI run that builds `.mcpb` on macOS and attaches it to the release. Title must be ≤25 chars. Format: `vX.Y.Z — Two-three words`.
8. Wait for CI — check `gh run list` to confirm all three jobs pass: `publish` (npm), `build-mcpb` (macOS build), `release-mcpb` (attaches `.mcpb` to release)
9. Verify: `gh release view vX.Y.Z` should show `passwd.mcpb` as an asset

**Important**: The `.mcpb` is NOT committed to git (it's in `.gitignore`). It's built by CI on macOS and attached to the GitHub release. Users download it from the releases page.

**Build script note**: `packages/passwd-mcpb/build.sh` pins `@passwd/passwd-lib` to `latest` during bundle install (since the new version may not be published yet), then overwrites with the local build. This works both locally and in CI.

Keep commit messages short for public repo. Don't expose security implementation details in public commits/releases.

Release titles should describe what changed for the user, not internal implementation. Good: "v1.5.3 — MCP config from note". Bad: "v1.5.3 — Robust MCP parser".
