import { useQuery } from "@tanstack/react-query"

import { runKeys } from "../lib/run-keys"
import type { RunsApi } from "../lib/runs-api"

/**
 * How many approvals wait for a person in this organization (get_inbox): the sidebar's and top bar's
 * "needs you" count. Only enabled once the session is on this organization (the server refuses others).
 */
export function useInboxCount({
  api,
  organizationId,
  ready,
}: {
  api: RunsApi | undefined
  organizationId: string | null
  ready: boolean
}): number {
  const query = useQuery({
    queryKey: organizationId ? runKeys.inbox(organizationId) : ["runs", "inbox", "none"],
    queryFn: () => api?.inbox(organizationId ?? "") ?? Promise.resolve({ needsYou: 0 }),
    enabled: Boolean(api && organizationId && ready),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  return query.data?.needsYou ?? 0
}

/**
 * How many runs are running now (list_runs with status running, first page of up to 100): the
 * sidebar's "N running". `more` is set when the organization has more than that page.
 */
export function useRunningCount({
  api,
  organizationId,
  ready,
}: {
  api: RunsApi | undefined
  organizationId: string | null
  ready: boolean
}): { running: number; more: boolean } {
  const query = useQuery({
    queryKey: organizationId ? runKeys.running(organizationId) : ["runs", "running", "none"],
    queryFn: () =>
      api?.list(organizationId ?? "", { status: "running", limit: 100 }) ??
      Promise.resolve({ runs: [], nextCursor: null }),
    enabled: Boolean(api && organizationId && ready),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  })
  return {
    running: query.data?.runs.length ?? 0,
    more: Boolean(query.data?.nextCursor),
  }
}
