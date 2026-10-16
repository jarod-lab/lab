import { createAgentsApi } from "./agents-api"
import { organizationHeaders } from "./org-header"

/** A fetch that sends the organization the page is showing with every product API call. */
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
  return createAgentsApi(organizationFetch(organizationId))
}
