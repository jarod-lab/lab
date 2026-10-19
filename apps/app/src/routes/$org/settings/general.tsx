import { createFileRoute, useRouter } from "@tanstack/react-router"

import { OrgGeneralContainer } from "../../../containers/org-general"
import { RouterLink } from "../../../containers/router-link"
import { useOrganizationsQuery } from "../../../containers/shell-data"
import { getOrgSettingsApi } from "../../../lib/org-settings-api"
import { getUploadsApi } from "../../../lib/uploads-api"
import { getWebAuth } from "../../../lib/web-auth"

export const Route = createFileRoute("/$org/settings/general")({
  component: OrgGeneralRoute,
})

function OrgGeneralRoute() {
  const { org: slug } = Route.useParams()
  const router = useRouter()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  return (
    <OrgGeneralContainer
      auth={auth}
      api={getOrgSettingsApi()}
      organization={organization}
      host={typeof window === "undefined" ? "" : window.location.host}
      onSlugChanged={(next) =>
        void router.navigate({ href: `/${next}/settings/general`, replace: true })
      }
      onExit={(next) => void router.navigate({ href: next ? `/${next}` : "/new", replace: true })}
      renderLink={RouterLink}
      uploads={getUploadsApi()}
    />
  )
}
