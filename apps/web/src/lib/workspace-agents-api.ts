import { organizationHeaders } from "./org-header"
import { WebError } from "./web-auth"

// The workspace agents: the workers an organization configures (list_agents and friends, /v1/workspace-agents).
// Not the AI clients connected to it (those are agents-api.ts). Every call names its organization and
// sends X-Organization-Id, so the server can refuse a call made for another org.

export type Autonomy = "suggest_only" | "ask_first" | "autonomous"

/** What the agent is doing now, from its open runs. */
export type ActivityState = "running" | "needs_you" | "queued" | "idle"

/** The settings the permissions board edits. */
export interface PermissionSettings {
  autonomy: Autonomy
  alwaysAskExternalPost: boolean
  alwaysAskMergeOrDeploy: boolean
  alwaysAskOverEnergyBudget: boolean
}

export interface WorkspaceAgent extends PermissionSettings {
  id: string
  name: string
  description: string | null
  energyBudgetWh: number | null
  pinned: boolean
  activity: ActivityState
  createdAt: string
  updatedAt: string
}

export interface CreateAgentInput {
  name: string
  description?: string | null
}

/** The fields update_agent takes. Omitted fields stay as they are. */
export type AgentPatch = Partial<PermissionSettings> & {
  name?: string
  description?: string | null
  pinned?: boolean
}

export interface WorkspaceAgentsApi {
  list(organizationId: string): Promise<WorkspaceAgent[]>
  create(organizationId: string, input: CreateAgentInput): Promise<WorkspaceAgent>
  update(organizationId: string, id: string, patch: AgentPatch): Promise<WorkspaceAgent>
  remove(organizationId: string, id: string): Promise<void>
  /** Every run of the agent, counted page by page. Needs run:read. */
  countRuns(organizationId: string, agentId: string): Promise<number>
}

const RUN_PAGE_SIZE = 100

async function request<T>(
  fetchImpl: typeof fetch,
  organizationId: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...organizationHeaders(organizationId),
  }
  if (init.body !== undefined) headers["content-type"] = "application/json"
  const response = await fetchImpl(`/v1${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; hint?: string }
    } | null
    const message = [body?.error?.message, body?.error?.hint].filter(Boolean).join(" ")
    throw new WebError(message || "Something went wrong", response.status)
  }
  return (await response.json()) as T
}

export function createWorkspaceAgentsApi(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): WorkspaceAgentsApi {
  return {
    async list(organizationId) {
      const body = await request<{ agents: WorkspaceAgent[] }>(
        fetchImpl,
        organizationId,
        "/workspace-agents",
      )
      return body.agents
    },
    async create(organizationId, input) {
      return request<WorkspaceAgent>(fetchImpl, organizationId, "/workspace-agents", {
        method: "POST",
        body: input,
      })
    },
    async update(organizationId, id, patch) {
      return request<WorkspaceAgent>(
        fetchImpl,
        organizationId,
        `/workspace-agents/${encodeURIComponent(id)}`,
        { method: "PATCH", body: patch },
      )
    },
    async remove(organizationId, id) {
      await request<{ deleted: true }>(
        fetchImpl,
        organizationId,
        `/workspace-agents/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
    },
    async countRuns(organizationId, agentId) {
      let count = 0
      let cursor: string | null = null
      do {
        const query = new URLSearchParams({ agentId, limit: String(RUN_PAGE_SIZE) })
        if (cursor) query.set("cursor", cursor)
        const page: { runs: unknown[]; nextCursor: string | null } = await request(
          fetchImpl,
          organizationId,
          `/runs?${query}`,
        )
        count += page.runs.length
        cursor = page.nextCursor
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
