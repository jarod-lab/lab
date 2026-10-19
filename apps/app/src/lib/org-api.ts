import { createAgentsApi } from "./agents-api"
import { organizationHeaders } from "./org-header"

/**
 * A fetch that sends the organization the page is showing with a raw product call. The typed calls
 * go through productClient instead; billing's usage read is the one that still needs a raw fetch.
 */
export function organizationFetch(organizationId: string): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        ...organizationHeaders(organizationId),
      },
    })
}

/** The agents API for one organization: every call carries `X-Organization-Id`. */
export function createOrganizationAgentsApi(organizationId: string) {
  return createAgentsApi(organizationId)
}
