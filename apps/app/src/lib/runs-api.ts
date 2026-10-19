import {
  payload,
  productClient,
  type QueryParams,
  type RequestBody,
  type ResponseBody,
} from "./product-client"

// The organization's agent runs (/v1/runs, /v1/approvals, /v1/inbox). Every call names its
// organization and sends X-Organization-Id; the server refuses a call made for another org, and a run
// of another org answers NOT_FOUND (a WebError with status 404).

/** One run, as list_runs returns it. */
export type RunSummary = ResponseBody<"list_runs">["runs"][number]
export type RunPage = ResponseBody<"list_runs">
export type RunStatus = RunSummary["status"]
export type Footprint = RunSummary["footprint"]

/** One run with its steps, approvals and messages, as get_run returns it. */
export type RunDetail = ResponseBody<"get_run">
export type RunStep = RunDetail["steps"][number]
export type StepStatus = RunStep["status"]
export type Approval = RunDetail["approvals"][number]
export type ApprovalDecision = NonNullable<Approval["decision"]>
export type RunMessage = RunDetail["messages"][number]

/** The filters list_runs takes; a null cursor means the first page. */
export type ListRunsInput = Omit<QueryParams<"list_runs">, "cursor"> & { cursor?: string | null }

export interface RunsApi {
  list(organizationId: string, input?: ListRunsInput): Promise<RunPage>
  get(organizationId: string, runId: string): Promise<RunDetail>
  decide(
    organizationId: string,
    approvalId: string,
    decision: RequestBody<"decide_approval">["decision"],
  ): Promise<Approval>
  undo(organizationId: string, approvalId: string): Promise<Approval>
  steer(organizationId: string, runId: string, body: string): Promise<RunMessage>
  defer(organizationId: string, runId: string, untilIso: string): Promise<RunSummary>
  /** Approvals waiting for a person here; 0 for anyone who can't approve. */
  inbox(organizationId: string): Promise<{ needsYou: number }>
}

export function createRunsApi(fetchImpl?: typeof fetch): RunsApi {
  // Each call names its organization, so the client is made per call.
  const forOrg = (organizationId: string) => productClient(organizationId, fetchImpl)
  return {
    async list(organizationId, input = {}) {
      const { cursor, ...filters } = input
      const query: QueryParams<"list_runs"> = {
        ...filters,
        limit: filters.limit ?? 50,
        cursor: cursor ?? undefined,
      }
      return payload(forOrg(organizationId).GET("/v1/runs", { params: { query } }))
    },
    async get(organizationId, runId) {
      return payload(
        forOrg(organizationId).GET("/v1/runs/{id}", { params: { path: { id: runId } } }),
      )
    },
    async decide(organizationId, approvalId, decision) {
      return payload(
        forOrg(organizationId).POST("/v1/approvals/{id}/decision", {
          params: { path: { id: approvalId } },
          body: { decision },
        }),
      )
    },
    async undo(organizationId, approvalId) {
      return payload(
        forOrg(organizationId).POST("/v1/approvals/{id}/undo", {
          params: { path: { id: approvalId } },
        }),
      )
    },
    async steer(organizationId, runId, body) {
      return payload(
        forOrg(organizationId).POST("/v1/runs/{id}/messages", {
          params: { path: { id: runId } },
          body: { body },
        }),
      )
    },
    async defer(organizationId, runId, untilIso) {
      return payload(
        forOrg(organizationId).POST("/v1/runs/{id}/defer", {
          params: { path: { id: runId } },
          body: { until: untilIso },
        }),
      )
    },
    async inbox(organizationId) {
      return payload(forOrg(organizationId).GET("/v1/inbox"))
    },
  }
}

let shared: RunsApi | undefined

/** The runs API for the browser, created on first use. */
export function getRunsApi(): RunsApi {
  shared ??= createRunsApi()
  return shared
}
