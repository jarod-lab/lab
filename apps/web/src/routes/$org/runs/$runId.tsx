import { createFileRoute } from "@tanstack/react-router"

import { RouterLink } from "../../../containers/router-link"
import { RunViewContainer } from "../../../containers/run-view"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { getRunsApi } from "../../../lib/runs-api"
import { getOrgSettingsApi } from "../../../lib/org-settings-api"
import { getWebAuth } from "../../../lib/web-auth"

// `/:org/runs/:runId`: one run of the organization (board DirLift).
export const Route = createFileRoute("/$org/runs/$runId")({
  component: RunRoute,
})

function RunRoute() {
  const { org: slug, runId } = Route.useParams()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <RunViewContainer
      auth={auth}
      api={getRunsApi()}
      settings={getOrgSettingsApi()}
      organization={organization}
      runId={runId}
      renderLink={RouterLink}
    />
  )
}
