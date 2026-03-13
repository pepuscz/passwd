#!/usr/bin/env node

import { execFile } from "node:child_process";
import { platform } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function openBrowser(url: string): void {
  if (platform() === "win32") {
    execFile("cmd.exe", ["/c", "start", "", url], () => {});
  } else {
    const cmd = platform() === "darwin" ? "open" : "xdg-open";
    execFile(cmd, [url], () => {});
  }
}

import {
  buildOAuthUrl,
  extractCodeFromRedirectUrl,
  exchangeCode,
  listSecrets,
  getSecret,
  getTotpCode,
  getCurrentUser,
  redactSecret,
} from "@passwd/passwd-lib";

const server = new McpServer({
  name: "passwd-mcp",
  version: "1.5.2",
});

// --- Tool 1: passwd_login ---
server.tool(
  "passwd_login",
  "Authenticate with passwd.team using Google OAuth. Call without redirectUrl to get the login URL, then call again with the redirect URL containing the auth code.",
  {
    redirectUrl: z
      .string()
      .optional()
      .describe(
        "The full redirect URL from Google OAuth (containing the code parameter). Omit to get the OAuth login URL."
      ),
  },
  async ({ redirectUrl }) => {
    if (!redirectUrl) {
      const oauthUrl = await buildOAuthUrl();
      openBrowser(oauthUrl);
      return {
        content: [
          {
            type: "text" as const,
            text: `A browser window has been opened for Google login.\n\nIf the browser did not open, copy this URL manually:\n${oauthUrl}\n\nAfter authenticating, you will be redirected. Copy the full redirect URL from your browser's address bar and call this tool again with it as the redirectUrl parameter.`,
          },
        ],
      };
    }

    try {
      const code = extractCodeFromRedirectUrl(redirectUrl);
      const tokens = await exchangeCode(code);
      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully authenticated! Access token saved. You can now use other passwd tools.`,
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Login failed: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 2: list_secrets ---
server.tool(
  "list_secrets",
  "List password records from passwd.team. Supports filtering by query text and secret type.",
  {
    query: z.string().optional().describe("Search query to filter secrets by name"),
    secretType: z
      .enum(["password", "paymentCard", "apiCredentials", "databaseCredentials", "sshKey", "secureNote"])
      .optional()
      .describe("Filter by secret type"),
    offset: z.number().optional().describe("Pagination offset (default: 0)"),
    limit: z.number().optional().describe("Maximum number of results to return (default: 50)"),
  },
  async (params) => {
    try {
      const result = await listSecrets({ ...params, limit: params.limit ?? 50 });
      // Strip favicon from list results to save tokens
      const secrets = result.secrets.map(({ favicon, ...rest }: Record<string, unknown>) => rest);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { totalCount: result.totalCount, secrets },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to list secrets: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 3: get_secret ---
server.tool(
  "get_secret",
  "Get secret details. Sensitive fields (password, keys, etc.) are redacted — use passwd CLI exec --inject to use credentials without exposing them.",
  {
    id: z.string().describe("The secret ID"),
  },
  async ({ id }) => {
    try {
      const secret = await getSecret(id);
      const redacted = redactSecret(secret);
      // Strip favicon (large base64 image) to save tokens
      const { favicon, ...rest } = redacted as unknown as Record<string, unknown>;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(rest, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to get secret: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 4: get_totp_code ---
const totpLastCall = new Map<string, number>();

server.tool(
  "get_totp_code",
  "Get the current TOTP (Time-based One-Time Password) code for a secret that has TOTP configured.",
  {
    id: z.string().describe("The secret ID that has TOTP configured"),
  },
  async ({ id }) => {
    try {
      const now = Date.now();
      const last = totpLastCall.get(id);
      if (last && now - last < 30_000) {
        const wait = Math.ceil((30_000 - (now - last)) / 1000);
        return {
          content: [{ type: "text" as const, text: `Rate limited: wait ${wait}s before requesting a new TOTP code for this secret.` }],
          isError: true,
        };
      }
      const totp = await getTotpCode(id);
      totpLastCall.set(id, now);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(totp, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to get TOTP code: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 5: get_current_user ---
server.tool(
  "get_current_user",
  "Get the currently authenticated user's profile information.",
  {},
  async () => {
    try {
      const user = await getCurrentUser();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(user, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to get user profile: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Start Server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Passwd MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
