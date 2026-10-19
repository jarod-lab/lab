import { createFileRoute } from "@tanstack/react-router"

import { ApiKeysContainer } from "../../../containers/api-keys"
import { RouterLink } from "../../../containers/router-link"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { getApiKeysApi } from "../../../lib/api-keys-api"
import { getOrgSettingsApi } from "../../../lib/org-settings-api"
import { getWebAuth } from "../../../lib/web-auth"

export const Route = createFileRoute("/$org/settings/api-keys")({
  component: OrgApiKeysRoute,
})

function OrgApiKeysRoute() {
  const { org: slug } = Route.useParams()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <ApiKeysContainer
      auth={auth}
      api={getApiKeysApi()}
      settings={getOrgSettingsApi()}
      organization={organization}
      renderLink={RouterLink}
    />
  )
}
