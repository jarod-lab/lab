import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { RouterLink } from "../../../containers/router-link"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { WorkspaceAgentsContainer } from "../../../containers/workspace-agents"
import { createOrganizationAgentsApi } from "../../../lib/org-api"
import { getOrgSettingsApi } from "../../../lib/org-settings-api"
import { getWorkspaceAgentsApi } from "../../../lib/workspace-agents-api"
import { getWebAuth } from "../../../lib/web-auth"
import { AgentsPage } from "../../../pages/agents-page"

type AgentsSearch = { view?: string; agent?: string }

// `?view=` picks a tab's sub-view (permissions by default, or connected), and `?agent=` the selected agent.
export const Route = createFileRoute("/$org/settings/agents")({
  validateSearch: (search: Record<string, unknown>): AgentsSearch => ({
    ...(typeof search.view === "string" ? { view: search.view } : {}),
    ...(typeof search.agent === "string" ? { agent: search.agent } : {}),
  }),
  component: OrgAgentsRoute,
})

function OrgAgentsRoute() {
  const { org: slug } = Route.useParams()
  const { view, agent } = Route.useSearch()
  const navigate = Route.useNavigate()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  // The connected-agents view's API is created once per organization, like the page's effects need.
  const connectedApi = useMemo(
    () => (organization ? createOrganizationAgentsApi(organization.id) : null),
    [organization],
  )
  if (!organization || !connectedApi) return null
  return (
    <WorkspaceAgentsContainer
      auth={auth}
      api={getWorkspaceAgentsApi()}
      settings={getOrgSettingsApi()}
      organization={organization}
      view={view}
      selectedId={agent}
      onSelect={(agentId) =>
        void navigate({
          search: (previous) => ({ ...previous, agent: agentId ?? undefined }),
          replace: true,
        })
      }
      connected={<AgentsPage api={connectedApi} />}
      renderLink={RouterLink}
    />
  )
}
