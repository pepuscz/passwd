import { getApiUrl, getAccessToken, refreshToken, loadTokens } from "./auth.js";
import type {
  Secret,
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

  // Client-side filtering by secret type
  if (params.secretType) {
    secrets = secrets.filter((s) => s.type === params.secretType);
  }

  // Client-side filtering by query (case-insensitive match on name, username, or web)
  if (params.query) {
    const q = params.query.toLowerCase();
    secrets = secrets.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.username?.toLowerCase().includes(q) ||
        s.web?.toLowerCase().includes(q)
    );
  }

  const totalCount = secrets.length;

  // Client-side pagination
  const offset = params.offset ?? 0;
  if (params.limit !== undefined) {
    secrets = secrets.slice(offset, offset + params.limit);
  } else if (offset > 0) {
    secrets = secrets.slice(offset);
  }

  return { secrets, totalCount };
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
  const response = await authFetch(`/secrets/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
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

export function redactSecret(secret: Secret): Partial<Secret> {
  const redacted = { ...secret } as Record<string, unknown>;
  for (const field of SENSITIVE_FIELDS) {
    if (field in redacted && redacted[field] != null) {
      redacted[field] = "••••••••";
    }
  }
  return redacted as Partial<Secret>;
}

// --- User ---

export async function getCurrentUser(): Promise<UserProfile> {
  const response = await authFetch("/me");
  return handleResponse<UserProfile>(response);
}
