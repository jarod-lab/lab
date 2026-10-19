import { createFileRoute } from "@tanstack/react-router"

import { RouterLink } from "../../../containers/router-link"
import { OrgSecurityContainer } from "../../../containers/org-security"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { getOrgSecurityApi } from "../../../lib/org-security-api"
import { getOrgSettingsApi } from "../../../lib/org-settings-api"
import { getWebAuth } from "../../../lib/web-auth"

export const Route = createFileRoute("/$org/settings/security")({
  component: OrgSecurityRoute,
})

function OrgSecurityRoute() {
  const { org: slug } = Route.useParams()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <OrgSecurityContainer
      auth={auth}
      api={getOrgSettingsApi()}
      securityApi={getOrgSecurityApi()}
      organization={organization}
      origin={typeof window === "undefined" ? "" : window.location.origin}
      renderLink={RouterLink}
    />
  )
}
