import { createFileRoute } from "@tanstack/react-router"

import { RouterLink } from "../../containers/router-link"
import { orgRoleLabel, useMemberRoles, useOrganizationsQuery } from "../../containers/shell-data"
import { getWebAuth } from "../../lib/web-auth"
import { OrgHomePage } from "../../pages/org-home-page"

export const Route = createFileRoute("/$org/")({
  component: OrgHomeRoute,
})

function OrgHomeRoute() {
  const { org: slug } = Route.useParams()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const roles = useMemberRoles(auth, organizations.data)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <OrgHomePage
      organization={organization}
      roleLabel={orgRoleLabel(roles.get(organization.id))}
      renderLink={RouterLink}
    />
  )
}
