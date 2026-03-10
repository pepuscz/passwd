#!/usr/bin/env node

import { execFile, exec } from "node:child_process";
import { platform } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

function openBrowser(url: string): void {
  if (platform() === "win32") {
    exec(`start "" ${JSON.stringify(url)}`, () => {});
  } else {
    const cmd = platform() === "darwin" ? "open" : "xdg-open";
    execFile(cmd, [url], () => {});
  }
}

import {
  buildOAuthUrl,
  extractCodeFromRedirectUrl,
  exchangeCode,
  loadTokens,
  listSecrets,
  getSecret,
  createSecret,
  updateSecret,
  deleteSecret,
  getTotpCode,
  enableSharing,
  revokeSharing,
  listGroups,
  listContacts,
  getCurrentUser,
} from "@passwd/passwd-lib";

const server = new McpServer({
  name: "passwd-mcp",
  version: "1.2.0",
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
  "Get full details of a specific secret including password, notes, and TOTP status.",
  {
    id: z.string().describe("The secret ID"),
  },
  async ({ id }) => {
    try {
      const secret = await getSecret(id);
      // Strip favicon (large base64 image) to save tokens
      const { favicon, ...rest } = secret as unknown as Record<string, unknown>;
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

// --- Tool 4: create_secret ---
const groupRefSchema = z.object({
  id: z.string(),
  accessPermissions: z.array(z.enum(["read", "write", "autofillOnly", "passkeyOnly"])),
}).describe("Group reference with access permissions");

const userRefSchema = z.object({
  id: z.string(),
  accessPermissions: z.array(z.enum(["read", "write", "autofillOnly", "passkeyOnly"])),
}).describe("User reference with access permissions");

const fileSchema = z.object({
  name: z.string(),
  data: z.string().describe("Data URI, e.g. data:text/plain;base64,SGVsbG8="),
}).nullable().describe("File attachment (null to remove)");

server.tool(
  "create_secret",
  "Create a new secret in passwd.team. Supports types: password, paymentCard, apiCredentials, databaseCredentials, sshKey, secureNote.",
  {
    type: z
      .enum(["password", "paymentCard", "apiCredentials", "databaseCredentials", "sshKey", "secureNote"])
      .describe("The type of secret to create"),
    name: z.string().describe("Name/title of the secret"),
    username: z.string().optional().describe("Username or email"),
    password: z.string().optional().describe("Password (for password/apiCredentials types)"),
    web: z.string().optional().describe("Website URL"),
    note: z.string().optional().describe("Notes"),
    tags: z.array(z.string()).optional().describe("Tags to categorize the secret"),
    groups: z.array(groupRefSchema).optional().describe("Groups to share with (use list_groups to find IDs)"),
    whitelistUsers: z.array(userRefSchema).optional().describe("Users to share with (use list_contacts to find IDs)"),
    file: fileSchema.optional().describe("File attachment as data URI"),
    visibleToAll: z.boolean().optional().describe("Make visible to all workspace users"),
    TOTP: z.string().optional().describe("TOTP secret key for generating one-time codes"),
    cardNumber: z.string().optional().describe("Card number (for paymentCard type)"),
    cvvCode: z.string().optional().describe("CVV code (for paymentCard type)"),
    credentials: z.string().optional().describe("Credentials string (for databaseCredentials type)"),
    privateKey: z.string().optional().describe("Private key content (for sshKey type)"),
    secureNote: z.string().optional().describe("Secure note content (for secureNote type)"),
  },
  async (params) => {
    try {
      const secret = await createSecret(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(secret, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to create secret: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 5: update_secret ---
server.tool(
  "update_secret",
  "Update an existing secret in passwd.team.",
  {
    id: z.string().describe("The secret ID to update"),
    name: z.string().optional().describe("Updated name"),
    username: z.string().optional().describe("Updated username"),
    password: z.string().optional().describe("Updated password"),
    web: z.string().optional().describe("Updated website URL"),
    note: z.string().optional().describe("Updated notes"),
    tags: z.array(z.string()).optional().describe("Updated tags"),
    groups: z.array(groupRefSchema).optional().describe("Groups to share with (use list_groups to find IDs)"),
    whitelistUsers: z.array(userRefSchema).optional().describe("Users to share with (use list_contacts to find IDs)"),
    file: fileSchema.optional().describe("File attachment as data URI (null to remove)"),
    visibleToAll: z.boolean().optional().describe("Make visible to all workspace users"),
    TOTP: z.string().optional().describe("Updated TOTP secret key"),
    cardNumber: z.string().optional().describe("Updated card number"),
    cvvCode: z.string().optional().describe("Updated CVV code"),
    credentials: z.string().optional().describe("Updated credentials"),
    privateKey: z.string().optional().describe("Updated private key"),
    secureNote: z.string().optional().describe("Updated secure note"),
  },
  async ({ id, ...updates }) => {
    try {
      const secret = await updateSecret(id, updates);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(secret, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to update secret: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 6: delete_secret ---
server.tool(
  "delete_secret",
  "Delete a secret from passwd.team. This action is irreversible.",
  {
    id: z.string().describe("The secret ID to delete"),
  },
  async ({ id }) => {
    try {
      await deleteSecret(id);
      return {
        content: [
          {
            type: "text" as const,
            text: `Secret ${id} has been deleted successfully.`,
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to delete secret: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 7: get_totp_code ---
server.tool(
  "get_totp_code",
  "Get the current TOTP (Time-based One-Time Password) code for a secret that has TOTP configured.",
  {
    id: z.string().describe("The secret ID that has TOTP configured"),
  },
  async ({ id }) => {
    try {
      const totp = await getTotpCode(id);
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

// --- Tool 8: share_secret ---
server.tool(
  "share_secret",
  "Enable or revoke sharing for a secret. When enabled, generates a share link. When revoked, disables the share link.",
  {
    id: z.string().describe("The secret ID to share or unshare"),
    activate: z.boolean().describe("true to enable sharing, false to revoke sharing"),
  },
  async ({ id, activate }) => {
    try {
      if (activate) {
        const result = await enableSharing(id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Sharing enabled for secret ${id}.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } else {
        await revokeSharing(id);
        return {
          content: [
            {
              type: "text" as const,
              text: `Sharing revoked for secret ${id}.`,
            },
          ],
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to ${activate ? "enable" : "revoke"} sharing: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 9: get_current_user ---
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

// --- Tool 10: list_groups ---
server.tool(
  "list_groups",
  "List available groups in the workspace. Use group IDs when sharing secrets via create_secret or update_secret.",
  {},
  async () => {
    try {
      const groups = await listGroups();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(groups, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to list groups: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Tool 11: list_contacts ---
server.tool(
  "list_contacts",
  "List available contacts (users) in the workspace. Use contact IDs when sharing secrets via whitelistUsers in create_secret or update_secret.",
  {},
  async () => {
    try {
      const contacts = await listContacts();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(contacts, null, 2),
          },
        ],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to list contacts: ${msg}` }],
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
