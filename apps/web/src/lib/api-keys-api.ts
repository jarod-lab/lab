import { type ConnectedAgent, createAgentsApi } from "./agents-api"
import { organizationHeaders } from "./org-header"
import { WebError } from "./web-auth"

/** An organization API key as the agents list returns it (key_<id> is the revoke id). */
export interface ApiKey {
  id: string
  name: string
  /** `resource:action` strings. */
  access: string[]
  createdAt: string
  lastUsedAt: string | null
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

function fromAgent(agent: ConnectedAgent): ApiKey {
  return {
    id: agent.id,
    name: agent.name,
    access: agent.access,
    createdAt: agent.createdAt,
    lastUsedAt: agent.lastUsedAt,
  }
}

/**
 * The browser implementation. Listing and revoking go through the same agents operations the
 * agents page uses (list_connected_agents, revoke_agent_access); only API keys are kept here.
 */
export function createApiKeysApi(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ApiKeysApi {
  return {
    async listKeys(organizationId) {
      const agents = await createAgentsApi(scopedFetch(fetchImpl, organizationId)).listAgents()
      return agents.filter((agent) => agent.type === "apiKey").map(fromAgent)
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
      await createAgentsApi(scopedFetch(fetchImpl, organizationId)).revokeAgent(id)
    },
  }
}

let shared: ApiKeysApi | undefined

/** The page's API for the browser, created on first use. */
export function getApiKeysApi(): ApiKeysApi {
  shared ??= createApiKeysApi()
  return shared
}
