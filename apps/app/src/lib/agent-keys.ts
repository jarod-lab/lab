import { qk } from "./query-keys"

// Query keys for the workspace agents. They sit under the organization's agents prefix, so a refresh
// of `qk.org(id).agents()` covers them too, and the sidebar's pinned list shares the page's cache entry.

export const workspaceAgentKeys = {
  list: (organizationId: string) => [...qk.org(organizationId).agents(), "workspace"] as const,
  runCount: (organizationId: string, agentId: string) =>
    [...qk.org(organizationId).agents(), "workspace", agentId, "runs"] as const,
}
