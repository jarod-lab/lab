import { qk } from "./query-keys"
import type { RunStatus } from "./runs-api"

// Query keys for runs. They sit under the organization's runs prefix, so `qk.org(id).runs()` covers
// the lists, the run details and the inbox count is kept beside them.

export const runKeys = {
  /** Every run list of the organization, any filter. */
  lists: (organizationId: string) => [...qk.org(organizationId).runs(), "list"] as const,
  list: (organizationId: string, status: RunStatus | "all") =>
    [...qk.org(organizationId).runs(), "list", status] as const,
  /** Approvals waiting for a person: the "needs you" section. */
  needsYou: (organizationId: string) => [...qk.org(organizationId).runs(), "needs-you"] as const,
  detail: (organizationId: string, runId: string) =>
    [...qk.org(organizationId).runs(), "detail", runId] as const,
  inbox: (organizationId: string) => [...qk.org(organizationId).runs(), "inbox"] as const,
  /** The running runs the sidebar counts. Under `lists`, so a run refresh covers it too. */
  running: (organizationId: string) =>
    [...qk.org(organizationId).runs(), "list", "running-count"] as const,
}
