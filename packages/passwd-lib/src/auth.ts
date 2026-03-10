import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AuthTokens } from "./types.js";

const GOOGLE_AUTH_ORIGIN = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";

const TOKEN_DIR = join(homedir(), ".passwd");

function getTokenFile(): string {
  const origin = getOrigin();
  const hash = createHash("sha256").update(origin).digest("hex").slice(0, 12);
  return join(TOKEN_DIR, `tokens-${hash}.json`);
}

function requireHttps(url: string, label: string): void {
  if (
    !url.startsWith("https://") &&
    !url.startsWith("http://localhost") &&
    !url.startsWith("http://127.0.0.1")
  ) {
    throw new Error(
      `${label} must use HTTPS (or http://localhost for development), got: ${url}`
    );
  }
}

function getOrigin(): string {
  const origin = process.env.PASSWD_ORIGIN;
  if (!origin) {
    throw new Error(
      "PASSWD_ORIGIN environment variable is required (e.g. https://your-company.passwd.team)"
    );
  }
  const normalized = origin.replace(/\/+$/, "");
  requireHttps(normalized, "PASSWD_ORIGIN");
  return normalized;
}

let _discoveredApiUrl: string | null = null;
let _discoveredClientId: string | null = null;
let _discoveryDone = false;

async function discoverFromOrigin(origin: string): Promise<void> {
  if (_discoveryDone) return;
  _discoveryDone = true;

  try {
    const response = await fetch(origin, { headers: { Accept: "text/html" } });
    const html = await response.text();

    // Discover API URL from <meta name="app-api" content="...">
    const apiMatch = html.match(/<meta\s+name=["']app-api["']\s+content=["']([^"']+)["']/i);
    if (apiMatch?.[1]) {
      const discovered = apiMatch[1].replace(/\/+$/, "");
      requireHttps(discovered, "Discovered API URL");
      _discoveredApiUrl = discovered;
    }

    // Discover client ID from the JS bundle
    const scriptMatch = html.match(/src=["']([^"']*index[^"']*\.js)["']/i);
    if (scriptMatch?.[1]) {
      const scriptUrl = new URL(scriptMatch[1], origin).href;
      const jsResponse = await fetch(scriptUrl);
      const js = await jsResponse.text();
      const clientIdMatch = js.match(/(\d+-[a-z0-9]+\.apps\.googleusercontent\.com)/);
      if (clientIdMatch?.[1]) {
        _discoveredClientId = clientIdMatch[1];
      }
    }
  } catch {
    // Fall through to defaults/env vars
  }
}

async function getClientId(): Promise<string> {
  if (process.env.PASSWD_CLIENT_ID) return process.env.PASSWD_CLIENT_ID;
  await discoverFromOrigin(getOrigin());
  if (_discoveredClientId) return _discoveredClientId;
  throw new Error("Could not discover Google OAuth client ID from the deployment. Set PASSWD_CLIENT_ID env var manually.");
}

export async function getApiUrl(): Promise<string> {
  const envUrl = process.env.PASSWD_API_URL;
  if (envUrl) {
    const normalized = envUrl.replace(/\/+$/, "");
    requireHttps(normalized, "PASSWD_API_URL");
    return normalized;
  }

  await discoverFromOrigin(getOrigin());
  return _discoveredApiUrl || `${getOrigin()}/api`;
}

function getRedirectUri(): string {
  return `${getOrigin()}/oauth/redirect`;
}

let _pendingOAuthState: string | null = null;

export async function buildOAuthUrl(): Promise<string> {
  const state = randomUUID();
  _pendingOAuthState = state;

  const clientId = await getClientId();
  const url = new URL(GOOGLE_AUTH_ORIGIN);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  return url.toString();
}

export function extractCodeFromRedirectUrl(redirectUrl: string): string {
  const url = new URL(redirectUrl);

  // Validate state parameter to prevent CSRF (login CSRF defense)
  const returnedState = url.searchParams.get("state");
  if (!_pendingOAuthState) {
    throw new Error("No pending OAuth state. Please call passwd_login (or `login`) first to start the login flow.");
  }
  if (returnedState !== _pendingOAuthState) {
    throw new Error("OAuth state mismatch — possible CSRF attack. Please restart the login flow.");
  }
  _pendingOAuthState = null;

  const code = url.searchParams.get("code");
  if (!code) {
    throw new Error("No 'code' parameter found in the redirect URL");
  }
  return code;
}

export async function exchangeCode(code: string): Promise<AuthTokens> {
  const apiUrl = await getApiUrl();
  const url = `${apiUrl}/v2/oauth/callback?code=${encodeURIComponent(code)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-islocalhost": "false",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth code exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json() as AuthTokens;
  if (!data.access_token) {
    throw new Error("No access_token in OAuth response");
  }

  data.saved_at = Date.now();
  await saveTokens(data);
  return data;
}

export async function refreshToken(tokens: AuthTokens): Promise<AuthTokens> {
  if (!tokens.refresh_token) {
    throw new Error("No refresh token available. Please re-authenticate.");
  }

  const apiUrl = await getApiUrl();
  const url = `${apiUrl}/v2/oauth/refresh-token`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-islocalhost": "false",
    },
    body: JSON.stringify({ refreshToken: tokens.refresh_token }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const data = await response.json() as { accessToken: string; expiration: number };
  if (!data.accessToken) {
    throw new Error("No accessToken in refresh response");
  }

  const refreshed: AuthTokens = {
    access_token: data.accessToken,
    refresh_token: tokens.refresh_token,
    expiry_date: data.expiration,
    saved_at: Date.now(),
  };
  await saveTokens(refreshed);
  return refreshed;
}

async function saveTokens(tokens: AuthTokens): Promise<void> {
  const tokenFile = getTokenFile();
  const data = { ...tokens, origin: getOrigin() };
  await mkdir(TOKEN_DIR, { recursive: true, mode: 0o700 });
  await writeFile(tokenFile, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await chmod(tokenFile, 0o600);
}

export function resetDiscoveryCache(): void {
  _discoveredApiUrl = null;
  _discoveredClientId = null;
  _discoveryDone = false;
}

export function getTokenDir(): string {
  return TOKEN_DIR;
}

export async function loadTokens(): Promise<AuthTokens | null> {
  // Check env var first
  const envToken = process.env.PASSWD_ACCESS_TOKEN;
  if (envToken) {
    return { access_token: envToken };
  }

  try {
    const content = await readFile(getTokenFile(), "utf-8");
    return JSON.parse(content) as AuthTokens;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new Error("Not authenticated. Use the passwd_login tool or set PASSWD_ACCESS_TOKEN.");
  }

  // Proactively refresh if token expires within 5 minutes
  if (tokens.expiry_date && Date.now() > tokens.expiry_date - 5 * 60 * 1000) {
    try {
      const refreshed = await refreshToken(tokens);
      return refreshed.access_token;
    } catch {
      return tokens.access_token; // let 401 retry handle it
    }
  }

  return tokens.access_token;
}
