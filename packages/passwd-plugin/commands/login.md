# /passwd:login

Connect to your passwd.team vault. This is an interactive conversation — guide the user step by step. Ask one question at a time and wait for their response.

## Step 1: Get the deployment URL

Ask the user: "What is your passwd.team URL? For example `https://acme.passwd.team`. If you use the default deployment, it's `https://app.passwd.team`."

Wait for their answer. Once they reply with a URL (e.g. `https://acme.passwd.team`):

Check if the current `PASSWD_ORIGIN` in the connector matches what they said. If it doesn't (e.g. still the placeholder `https://your-deployment.passwd.team`), tell them:

"I need you to update one setting — go to **Plugins → Passwd → Connectors → passwd-mcp → Edit**, change `PASSWD_ORIGIN` to `{their URL}`, save, and restart this conversation. Then run `/passwd:login` again."

Stop here — don't continue until they restart.

If `PASSWD_ORIGIN` already matches, continue to step 2.

## Step 2: Login

Tell the user: "Great, let me start the login. A browser window will open for Google sign-in."

Call the `passwd_login` tool (without redirectUrl) to start the OAuth flow.

Then tell the user: "After signing in with Google, you'll be redirected to a page. Copy the full URL from your browser's address bar and paste it here."

Wait for them to paste the redirect URL. Then call `passwd_login` again with their URL as the `redirectUrl` parameter.

## Step 3: Verify

Call `get_current_user` and show: "You're logged in as **{name}** ({email}). You're all set!"

Then tell them what they can do:
- Ask about any credential and I'll search your vault
- Use `/passwd:run-with-secret` to inject secrets into commands
- Ask for TOTP codes for 2FA
