import { createAgentsApi } from "./agents-api"
import { organizationHeaders } from "./org-header"
import { WebError } from "./web-auth"

/**
 * An organization API key as GET /v1/api-keys (list_api_keys) returns it. `start` is the first
 * characters of the key, for telling keys apart; the key itself is never shown again.
 */
export interface ApiKey {
  id: string
  name: string | null
  start: string | null
  /** `resource: [action, ...]`, as the server stores it. */
  permissions: Record<string, string[]>
  createdAt: string
  createdBy: { id: string; name: string } | null
  lastUsedAt: string | null
  expiresAt: string | null
}

export interface CreateApiKeyInput {
  name: string
  permissions: Record<string, string[]>
  expiresInDays?: number
}

/** The response of create_api_key. `key` is the secret: the server never returns it again. */
export interface CreatedApiKey {
  id: string
  key: string
  permissions: Record<string, string[]>
}

/** Product calls for one organization: each sends X-Organization-Id with the session cookie. */
export interface ApiKeysApi {
  listKeys(organizationId: string): Promise<ApiKey[]>
  createKey(organizationId: string, input: CreateApiKeyInput): Promise<CreatedApiKey>
  revokeKey(organizationId: string, id: string): Promise<void>
}

const scopedFetch =
  (fetchImpl: typeof fetch, organizationId: string): typeof fetch =>
  (input, init) =>
    fetchImpl(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        ...organizationHeaders(organizationId),
      },
    })

/**
 * The browser implementation. Listing goes through list_api_keys (apiKey:read); revoking goes through
 * revoke_agent_access, which names a key as `key_<id>` (the connected-agents id), not by its raw id.
 */
export function createApiKeysApi(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiKeysApi {
  return {
    async listKeys(organizationId) {
      const response = await scopedFetch(fetchImpl, organizationId)("/v1/api-keys", {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        throw new WebError(body?.error?.message ?? "Could not load the API keys", response.status)
      }
      const body = (await response.json()) as { keys: ApiKey[] }
      return body.keys
    },
    async createKey(organizationId, input) {
      const response = await scopedFetch(fetchImpl, organizationId)("/v1/api-keys", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string; hint?: string }
        } | null
        // The server says why (e.g. a permission the caller doesn't have); the hint says what to do.
        const message = [body?.error?.message, body?.error?.hint].filter(Boolean).join(" ")
        throw new WebError(message || "Could not create the API key", response.status)
      }
      return (await response.json()) as CreatedApiKey
    },
    async revokeKey(organizationId, id) {
      await createAgentsApi(scopedFetch(fetchImpl, organizationId)).revokeAgent(revokeIdOf(id))
    },
  }
}

/** The id revoke_agent_access takes for an API key: the connected-agents form, `key_<id>`. */
export function revokeIdOf(keyId: string): string {
  return `key_${keyId}`
}

let shared: ApiKeysApi | undefined

/** The page's API for the browser, created on first use. */
export function getApiKeysApi(): ApiKeysApi {
  shared ??= createApiKeysApi()
  return shared
}
