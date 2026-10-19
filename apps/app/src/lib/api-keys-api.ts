import { payload, productClient, type RequestBody, type ResponseBody } from "./product-client"

/**
 * An organization API key as GET /v1/api-keys (list_api_keys) returns it. `start` is the first
 * characters of the key, for telling keys apart; the key itself is never shown again.
 */
export type ApiKey = ResponseBody<"list_api_keys">["keys"][number]

export type CreateApiKeyInput = RequestBody<"create_api_key">

/** The response of create_api_key. `key` is the secret: the server never returns it again. */
export type CreatedApiKey = ResponseBody<"create_api_key">

/** Product calls for one organization: each sends X-Organization-Id with the session cookie. */
export interface ApiKeysApi {
  listKeys(organizationId: string): Promise<ApiKey[]>
  createKey(organizationId: string, input: CreateApiKeyInput): Promise<CreatedApiKey>
  revokeKey(organizationId: string, id: string): Promise<void>
}

/**
 * The browser implementation. Listing goes through list_api_keys (apiKey:read); revoking goes through
 * revoke_agent_access, which names a key as `key_<id>` (the connected-agents id), not by its raw id.
 */
export function createApiKeysApi(fetchImpl?: typeof fetch): ApiKeysApi {
  // Each call names its organization, so the client is made per call.
  const forOrg = (organizationId: string) => productClient(organizationId, fetchImpl)
  return {
    async listKeys(organizationId) {
      return (await payload(forOrg(organizationId).GET("/v1/api-keys"))).keys
    },
    async createKey(organizationId, input) {
      // The server says why a create is refused (e.g. a permission the caller doesn't have).
      return payload(forOrg(organizationId).POST("/v1/api-keys", { body: input }))
    },
    async revokeKey(organizationId, id) {
      await payload(
        forOrg(organizationId).DELETE("/v1/agents/{id}", {
          params: { path: { id: revokeIdOf(id) } },
        }),
      )
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
