import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"

import { createOrganizationAgentsApi } from "../../../lib/org-api"
import { getWebAuth } from "../../../lib/web-auth"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { AgentsPage } from "../../../pages/agents-page"

export const Route = createFileRoute("/$org/settings/agents")({
  component: OrgAgentsRoute,
})

function OrgAgentsRoute() {
  const { org: slug } = Route.useParams()
  const organizations = useOrganizationsQuery(getWebAuth())
  const organization = organizations.data?.find((org) => org.slug === slug)
  // The page's effects depend on the api object, so it is created once per organization.
  const api = useMemo(
    () => (organization ? createOrganizationAgentsApi(organization.id) : null),
    [organization],
  )
  if (!api) return null
  return <AgentsPage api={api} />
}
