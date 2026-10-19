import { payload, productClient, type QueryParams, type ResponseBody } from "./product-client"

// The AI clients connected to an organization (the API keys and OAuth clients that act for it), and
// its audit trail. Not the workspace agents (workspace-agents-api.ts).

/**
 * One connected agent, as list_connected_agents returns it. clientId and keyId are optional here so
 * that fixtures written against the earlier hand-typed shape (which omitted them) still type-check.
 */
export type ConnectedAgent = Omit<
  ResponseBody<"list_connected_agents">["agents"][number],
  "clientId" | "keyId"
> &
  Partial<Pick<ResponseBody<"list_connected_agents">["agents"][number], "clientId" | "keyId">>

/** One audit event, as list_audit_events returns it. */
export type AuditEvent = ResponseBody<"list_audit_events">["events"][number]

/** The REST operations behind the agents settings page (contracts.md, N4 operations). */
export interface AgentsApi {
  listAgents(): Promise<ConnectedAgent[]>
  revokeAgent(id: string): Promise<void>
  listAuditEvents(cursor?: string): Promise<{ events: AuditEvent[]; nextCursor: string | null }>
}

/**
 * The browser implementation. With an organization, every call sends X-Organization-Id; without one
 * the session's active organization answers.
 */
export function createAgentsApi(organizationId?: string, fetchImpl?: typeof fetch): AgentsApi {
  const client = productClient(organizationId, fetchImpl)
  return {
    async listAgents() {
      return (await payload(client.GET("/v1/agents"))).agents
    },
    async revokeAgent(id) {
      await payload(client.DELETE("/v1/agents/{id}", { params: { path: { id } } }))
    },
    async listAuditEvents(cursor) {
      const query: QueryParams<"list_audit_events"> = cursor ? { cursor } : {}
      return payload(client.GET("/v1/audit-events", { params: { query } }))
    },
  }
}
