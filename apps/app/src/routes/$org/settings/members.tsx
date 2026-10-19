import { createFileRoute } from "@tanstack/react-router"

import { MembersContainer } from "../../../containers/members"
import { RouterLink } from "../../../containers/router-link"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { getMembersApi } from "../../../lib/members-api"
import { getOrgSettingsApi } from "../../../lib/org-settings-api"
import { getWebAuth } from "../../../lib/web-auth"

export const Route = createFileRoute("/$org/settings/members")({
  component: OrgMembersRoute,
})

function OrgMembersRoute() {
  const { org: slug } = Route.useParams()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <MembersContainer
      auth={auth}
      api={getOrgSettingsApi()}
      membersApi={getMembersApi()}
      organization={organization}
      renderLink={RouterLink}
    />
  )
}
