import { createFileRoute } from "@tanstack/react-router"

import { OrgBillingContainer } from "../../../containers/org-billing"
import { RouterLink } from "../../../containers/router-link"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { getOrgSettingsApi } from "../../../lib/org-settings-api"
import { getWebAuth } from "../../../lib/web-auth"

export const Route = createFileRoute("/$org/settings/billing")({
  component: OrgBillingRoute,
})

function OrgBillingRoute() {
  const { org: slug } = Route.useParams()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <OrgBillingContainer
      auth={auth}
      api={getOrgSettingsApi()}
      organization={organization}
      renderLink={RouterLink}
    />
  )
}
