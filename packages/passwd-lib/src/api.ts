import { getApiUrl, getAccessToken, refreshToken, loadTokens } from "./auth.js";
import type {
  Secret,
  SecretFile,
  SecretListItem,
  TOTPResponse,
  ShareResponse,
  UserProfile,
  GroupInfo,
  ContactInfo,
} from "./types.js";

async function authFetch(
  path: string,
  options: RequestInit = {},
  baseVersion: "v2" | "v3" = "v2",
  retry = true,
): Promise<Response> {
  const apiUrl = await getApiUrl();
  const token = await getAccessToken();
  const url = `${apiUrl}/${baseVersion}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 && retry) {
    // Try refreshing the token
    try {
      const tokens = await loadTokens();
      if (!tokens) throw new Error("No tokens");
      const newTokens = await refreshToken(tokens);
      const retryResponse = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${newTokens.access_token}`,
        },
      });
      return retryResponse;
    } catch {
      throw new Error("Authentication expired. Please re-authenticate.");
    }
  }

  return response;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error (${response.status}): ${text}`);
  }
  return response.json() as Promise<T>;
}

// --- Secrets ---

export interface ListSecretsParams {
  query?: string;
  secretType?: string;
  offset?: number;
  limit?: number;
}

export interface ListSecretsResult {
  secrets: SecretListItem[];
  totalCount: number;
}

/** Pure filtering + pagination logic, extracted for testability. */
export function filterAndPaginate(
  secrets: SecretListItem[],
  params: ListSecretsParams = {},
): ListSecretsResult {
  let filtered = secrets;

  // Filter by secret type
  if (params.secretType) {
    filtered = filtered.filter((s) => s.type === params.secretType);
  }

  // Filter by query (case-insensitive match on name, username, or web)
  if (params.query) {
    const q = params.query.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.username?.toLowerCase().includes(q) ||
        s.web?.toLowerCase().includes(q)
    );
  }

  const totalCount = filtered.length;

  // Pagination
  const offset = params.offset ?? 0;
  if (params.limit !== undefined) {
    filtered = filtered.slice(offset, offset + params.limit);
  } else if (offset > 0) {
    filtered = filtered.slice(offset);
  }

  return { secrets: filtered, totalCount };
}

export async function listSecrets(params: ListSecretsParams = {}): Promise<ListSecretsResult> {
  // The API does not support query parameters for filtering/pagination,
  // so we fetch all secrets and filter/paginate client-side.
  const response = await authFetch("/secrets", {}, "v3");
  const data = await handleResponse<Record<string, SecretListItem> | SecretListItem[]>(response);

  // API may return object keyed by id or array
  let secrets: SecretListItem[];
  if (Array.isArray(data)) {
    secrets = data;
  } else if (data && typeof data === "object") {
    secrets = Object.values(data);
  } else {
    secrets = [];
  }

  return filterAndPaginate(secrets, params);
}

export async function getSecret(id: string): Promise<Secret> {
  const response = await authFetch(`/secrets/${encodeURIComponent(id)}`);
  return handleResponse<Secret>(response);
}

export async function createSecret(secret: Partial<Secret>): Promise<Secret> {
  const response = await authFetch("/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(secret),
  });
  return handleResponse<Secret>(response);
}

export async function updateSecret(id: string, updates: Partial<Secret>): Promise<Secret> {
  // The API resets the secret type to "password" if type is omitted from the
  // update payload. Fetch the current type and include it to preserve it.
  let payload = updates;
  if (!updates.type) {
    const current = await getSecret(id);
    payload = { type: current.type, ...updates };
  }
  const response = await authFetch(`/secrets/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<Secret>(response);
}

export async function deleteSecret(id: string): Promise<void> {
  const response = await authFetch(`/secrets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Delete failed (${response.status}): ${text}`);
  }
}

// --- TOTP ---

export async function getTotpCode(id: string): Promise<TOTPResponse> {
  const response = await authFetch(`/secrets/${encodeURIComponent(id)}/TOTP`);
  return handleResponse<TOTPResponse>(response);
}

// --- Sharing ---

export async function enableSharing(id: string): Promise<ShareResponse> {
  const response = await authFetch(`/secrets/${encodeURIComponent(id)}/share`, {
    method: "POST",
  });
  return handleResponse<ShareResponse>(response);
}

export async function revokeSharing(id: string): Promise<void> {
  const response = await authFetch(`/secrets/${encodeURIComponent(id)}/share`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Revoke sharing failed (${response.status}): ${text}`);
  }
}

// --- Groups & Contacts ---

export async function listGroups(): Promise<GroupInfo[]> {
  const response = await authFetch("/groups-query");
  const data = await handleResponse<{ data: GroupInfo[] }>(response);
  return data.data;
}

export async function listContacts(): Promise<ContactInfo[]> {
  const response = await authFetch("/contacts-query");
  const data = await handleResponse<{ data: ContactInfo[] }>(response);
  return data.data;
}

// --- Redaction ---

const SENSITIVE_FIELDS = ["password", "cardNumber", "cvvCode", "credentials", "privateKey", "secureNote", "TOTP"];
const REDACTED = "••••••••";

function redactFields(source: object): Record<string, unknown> {
  const redacted = { ...source } as Record<string, unknown>;
  for (const field of SENSITIVE_FIELDS) {
    if (field in redacted && redacted[field] != null) {
      redacted[field] = REDACTED;
    }
  }
  // File attachments carry their content inline as a data URL: keep the
  // file name (it identifies the attachment), redact the content.
  const file = redacted.file as Partial<SecretFile> | null | undefined;
  if (file && typeof file === "object" && file.data != null) {
    redacted.file = { ...file, data: REDACTED };
  }
  return redacted;
}

export function redactSecret(secret: Secret): Partial<Secret> {
  return redactFields(secret) as Partial<Secret>;
}

/**
 * Redact a list item. The list endpoint returns full secret objects,
 * attachments included, so list output needs the same redaction as get.
 */
export function redactSecretListItem(item: SecretListItem): SecretListItem {
  return redactFields(item) as SecretListItem;
}

/**
 * Decode a secret's file attachment. The API stores attachments as data URLs
 * (`data:<mime>;base64,<payload>`); a data URL without `;base64` is
 * percent-decoded.
 */
export function decodeSecretFile(file: SecretFile): Buffer {
  const match = /^data:([^,]*),(.*)$/s.exec(file.data);
  if (!match) {
    throw new Error(`Attachment '${file.name}' is not a data URL`);
  }
  const [, meta, payload] = match;
  return meta.split(";").includes("base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf-8");
}

// --- User ---

export async function getCurrentUser(): Promise<UserProfile> {
  const response = await authFetch("/me");
  return handleResponse<UserProfile>(response);
}
