import { WebError } from "./web-auth"

export interface ConnectedAgent {
  id: string
  type: "oauthClient" | "apiKey"
  name: string
  createdAt: string
  lastUsedAt: string | null
  access: string[]
}

export interface AuditEvent {
  id: string
  at: string
  actor: { type: string; id: string }
  clientId: string | null
  operation: string
  outcome: string
  requestId: string | null
}

/** The REST operations behind the agents settings page (contracts.md, N4 operations). */
export interface AgentsApi {
  listAgents(): Promise<ConnectedAgent[]>
  revokeAgent(id: string): Promise<void>
  listAuditEvents(cursor?: string): Promise<{ events: AuditEvent[]; nextCursor: string | null }>
}

/** Errors come back as `{ error: { code, message } }`. */
async function request<T>(
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchImpl(`/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...init.headers },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new WebError(body?.error?.message ?? "Something went wrong", response.status)
  }
  return (await response.json()) as T
}

export function createAgentsApi(fetchImpl: typeof fetch = (...args) => fetch(...args)): AgentsApi {
  return {
    async listAgents() {
      const body = await request<{ agents: ConnectedAgent[] }>(fetchImpl, "/agents")
      return body.agents
    },
    async revokeAgent(id) {
      await request<{ revoked: true }>(fetchImpl, `/agents/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    },
    async listAuditEvents(cursor) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
      return request<{ events: AuditEvent[]; nextCursor: string | null }>(
        fetchImpl,
        `/audit-events${query}`,
      )
    },
  }
}
