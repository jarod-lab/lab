import { recordServerDate } from "./server-clock"
import { organizationHeaders } from "./org-header"
import { WebError } from "./web-auth"

// The organization's agent runs (/v1/runs, /v1/approvals, /v1/inbox). Every call names its
// organization and sends X-Organization-Id; the server refuses a call made for another org, and a run
// of another org answers NOT_FOUND (a WebError with status 404).

export type RunStatus = "queued" | "running" | "needs_you" | "done" | "failed"
export type StepStatus = RunStatus

export interface Footprint {
  energyWh: number
  tokens: number
  toolCalls: number
}

export interface RunSummary {
  id: string
  agentId: string
  title: string
  status: RunStatus
  /** Markdown, or null until the agent writes one. */
  summary: string | null
  startedBy: { type: "user" | "apiKey"; id: string } | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  /** Set while the run is deferred (status queued). */
  deferredUntil: string | null
  durationMs: number | null
  footprint: Footprint
}

export interface RunStep {
  id: string
  position: number
  kind: string
  title: string
  detail: string | null
  status: StepStatus
  progressDone: number | null
  progressTotal: number | null
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
}

export interface ApprovalDecision {
  decidedBy: string | null
  decidedAt: string | null
  effectiveAt: string | null
  /** Until when undo works; null once the decision has taken effect. */
  undoableUntil: string | null
}

export interface Approval {
  id: string
  stepId: string | null
  action: string
  detail: string | null
  requestedAt: string
  /** "pending" until a decision takes effect, then approved or denied. */
  status: "pending" | "approved" | "denied"
  /** Shown to people only. */
  decision: ApprovalDecision | null
}

export interface RunMessage {
  id: string
  body: string
  authorId: string
  createdAt: string
}

export interface RunDetail extends RunSummary {
  footprint: Footprint & { energyBudgetWh: number | null }
  steps: RunStep[]
  approvals: Approval[]
  messages: RunMessage[]
}

export interface RunPage {
  runs: RunSummary[]
  nextCursor: string | null
}

export interface ListRunsInput {
  status?: RunStatus
  cursor?: string | null
  limit?: number
}

export interface RunsApi {
  list(organizationId: string, input?: ListRunsInput): Promise<RunPage>
  get(organizationId: string, runId: string): Promise<RunDetail>
  decide(
    organizationId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<Approval>
  undo(organizationId: string, approvalId: string): Promise<Approval>
  steer(organizationId: string, runId: string, body: string): Promise<RunMessage>
  defer(organizationId: string, runId: string, untilIso: string): Promise<RunSummary>
  /** Approvals waiting for a person here; 0 for anyone who can't approve. */
  inbox(organizationId: string): Promise<{ needsYou: number }>
}

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
  const received = Date.now()
  const response = await fetchImpl(`/v1${path}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  recordServerDate(response.headers.get("date"), received)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; hint?: string }
    } | null
    const message = [body?.error?.message, body?.error?.hint].filter(Boolean).join(" ")
    throw new WebError(message || "Something went wrong", response.status)
  }
  return (await response.json()) as T
}

export function createRunsApi(fetchImpl: typeof fetch = (...args) => fetch(...args)): RunsApi {
  return {
    async list(organizationId, input = {}) {
      const query = new URLSearchParams({ limit: String(input.limit ?? 50) })
      if (input.status) query.set("status", input.status)
      if (input.cursor) query.set("cursor", input.cursor)
      return request<RunPage>(fetchImpl, organizationId, `/runs?${query}`)
    },
    async get(organizationId, runId) {
      return request<RunDetail>(fetchImpl, organizationId, `/runs/${encodeURIComponent(runId)}`)
    },
    async decide(organizationId, approvalId, decision) {
      return request<Approval>(
        fetchImpl,
        organizationId,
        `/approvals/${encodeURIComponent(approvalId)}/decision`,
        { method: "POST", body: { decision } },
      )
    },
    async undo(organizationId, approvalId) {
      return request<Approval>(
        fetchImpl,
        organizationId,
        `/approvals/${encodeURIComponent(approvalId)}/undo`,
        { method: "POST" },
      )
    },
    async steer(organizationId, runId, body) {
      return request<RunMessage>(
        fetchImpl,
        organizationId,
        `/runs/${encodeURIComponent(runId)}/messages`,
        { method: "POST", body: { body } },
      )
    },
    async defer(organizationId, runId, untilIso) {
      return request<RunSummary>(
        fetchImpl,
        organizationId,
        `/runs/${encodeURIComponent(runId)}/defer`,
        { method: "POST", body: { until: untilIso } },
      )
    },
    async inbox(organizationId) {
      return request<{ needsYou: number }>(fetchImpl, organizationId, "/inbox")
    },
  }
}

let shared: RunsApi | undefined

/** The runs API for the browser, created on first use. */
export function getRunsApi(): RunsApi {
  shared ??= createRunsApi()
  return shared
}
