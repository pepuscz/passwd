# /passwd:run-with-secret

Inject a credential into a command without exposing it.

Follow these steps:

1. **Find the secret** — ask the user what credential they need, then use `list_secrets` to search for it.

2. **Confirm the secret** — show the user the matching secret(s) by name and ID. Use `get_secret` to show details (credentials will be redacted). Confirm which secret to use.

3. **Pick the field** — ask which field to inject. Common fields:
   - `password` (default) — the password or API key
   - `username` — the username
   - `credentials` — database credentials string
   - `privateKey` — SSH private key
   - `secureNote` — secure note content

4. **Build the command** — ask the user what command they want to run with this credential. Build the `exec --inject` command:

   ```bash
   npx -y @passwd/passwd-agent-cli@1.4.4 exec --inject ENV_VAR=SECRET_ID:field -- their-command
   ```

   Choose a descriptive `ENV_VAR` name (e.g. `DB_PASS`, `API_KEY`, `SSH_KEY`).

5. **Run it** — execute the command. The credential goes directly to the subprocess and stdout values are always masked.
