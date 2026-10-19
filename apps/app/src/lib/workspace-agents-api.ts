import { payload, productClient, type RequestBody, type ResponseBody } from "./product-client"

// The workspace agents: the workers an organization configures (list_agents and friends, /v1/workspace-agents).
// Not the AI clients connected to it (those are agents-api.ts). Every call names its organization and
// sends X-Organization-Id, so the server can refuse a call made for another org.

/** One workspace agent, as list_agents returns it. */
export type WorkspaceAgent = ResponseBody<"list_agents">["agents"][number]

export type Autonomy = WorkspaceAgent["autonomy"]

/** What the agent is doing now, from its open runs. */
export type ActivityState = WorkspaceAgent["activity"]

/** The settings the permissions board edits. */
export type PermissionSettings = Pick<
  WorkspaceAgent,
  "autonomy" | "alwaysAskExternalPost" | "alwaysAskMergeOrDeploy" | "alwaysAskOverEnergyBudget"
>

export type CreateAgentInput = RequestBody<"create_agent">

/** The fields update_agent takes. Omitted fields stay as they are. */
export type AgentPatch = RequestBody<"update_agent">

export interface WorkspaceAgentsApi {
  list(organizationId: string): Promise<WorkspaceAgent[]>
  create(organizationId: string, input: CreateAgentInput): Promise<WorkspaceAgent>
  update(organizationId: string, id: string, patch: AgentPatch): Promise<WorkspaceAgent>
  remove(organizationId: string, id: string): Promise<void>
  /** Every run of the agent, counted page by page. Needs run:read. */
  countRuns(organizationId: string, agentId: string): Promise<number>
}

const RUN_PAGE_SIZE = 100

export function createWorkspaceAgentsApi(fetchImpl?: typeof fetch): WorkspaceAgentsApi {
  // Each call names its organization, so the client is made per call.
  const forOrg = (organizationId: string) => productClient(organizationId, fetchImpl)
  return {
    async list(organizationId) {
      return (await payload(forOrg(organizationId).GET("/v1/workspace-agents"))).agents
    },
    async create(organizationId, input) {
      return payload(forOrg(organizationId).POST("/v1/workspace-agents", { body: input }))
    },
    async update(organizationId, id, patch) {
      return payload(
        forOrg(organizationId).PATCH("/v1/workspace-agents/{id}", {
          params: { path: { id } },
          body: patch,
        }),
      )
    },
    async remove(organizationId, id) {
      await payload(
        forOrg(organizationId).DELETE("/v1/workspace-agents/{id}", {
          params: { path: { id } },
        }),
      )
    },
    async countRuns(organizationId, agentId) {
      const client = forOrg(organizationId)
      let count = 0
      let cursor: string | undefined
      do {
        const page = await payload(
          client.GET("/v1/runs", {
            params: { query: { agentId, limit: RUN_PAGE_SIZE, cursor } },
          }),
        )
        count += page.runs.length
        cursor = page.nextCursor ?? undefined
      } while (cursor)
      return count
    },
  }
}

let shared: WorkspaceAgentsApi | undefined

/** The page's API for the browser, created on first use. */
export function getWorkspaceAgentsApi(): WorkspaceAgentsApi {
  shared ??= createWorkspaceAgentsApi()
  return shared
}
