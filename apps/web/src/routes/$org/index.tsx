import { createFileRoute } from "@tanstack/react-router"

import { OrgRunsContainer } from "../../containers/org-runs"
import { RouterLink } from "../../containers/router-link"
import { useOrganizationsQuery } from "../../containers/shell-data"
import { runFilterOf } from "../../lib/run-view"
import { getRunsApi } from "../../lib/runs-api"
import { getWebAuth } from "../../lib/web-auth"

type HomeSearch = { status?: string }

// `/:org`: the organization's runs. `?status=` filters them (e.g. needs_you).
export const Route = createFileRoute("/$org/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    typeof search.status === "string" ? { status: search.status } : {},
  component: OrgHomeRoute,
})

function OrgHomeRoute() {
  const { org: slug } = Route.useParams()
  const { status } = Route.useSearch()
  const navigate = Route.useNavigate()
  const auth = getWebAuth()
  const organizations = useOrganizationsQuery(auth)
  const organization = organizations.data?.find((org) => org.slug === slug)
  if (!organization) return null
  const filter = runFilterOf(status)
  return (
    <OrgRunsContainer
      auth={auth}
      api={getRunsApi()}
      organization={organization}
      filter={filter}
      onFilterChange={(next) =>
        void navigate({
          search: next === "all" ? {} : { status: next },
          replace: true,
        })
      }
      renderLink={RouterLink}
    />
  )
}
