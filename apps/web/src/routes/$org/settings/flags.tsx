import { createFileRoute } from "@tanstack/react-router"

import { FeatureFlagsContainer } from "../../../containers/feature-flags"
import { RouterLink } from "../../../containers/router-link"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { getFeatureFlagsApi } from "../../../lib/feature-flags-api"
import { getWebAuth } from "../../../lib/web-auth"

export const Route = createFileRoute("/$org/settings/flags")({
  component: OrgFeatureFlagsRoute,
})

function OrgFeatureFlagsRoute() {
  const { org: slug } = Route.useParams()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <FeatureFlagsContainer
      auth={auth}
      api={getFeatureFlagsApi()}
      organization={organization}
      renderLink={RouterLink}
    />
  )
}
