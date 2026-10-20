import { createFileRoute, useRouter } from "@tanstack/react-router"

import { AdminContainer } from "../../containers/admin"
import { useAdminAccess } from "../../containers/admin-access"
import { RouterLink } from "../../containers/router-link"
import { getAdminApi } from "../../lib/admin-api"
import { adminTabs } from "../../lib/admin-nav"

// The console's Users tab: platform admins only; the page answers "Not available" to anyone else.
export const Route = createFileRoute("/admin/users")({
  component: AdminUsersRoute,
})

function AdminUsersRoute() {
  const router = useRouter()
  const { access } = useAdminAccess()
  return (
    <AdminContainer
      api={getAdminApi()}
      tabs={adminTabs(access)}
      onNavigate={(href) => void router.navigate({ href })}
      renderLink={RouterLink}
    />
  )
}
