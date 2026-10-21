import { createFileRoute } from "@tanstack/react-router"

import { AdminFlagsContainer } from "../../containers/admin-flags"
import { RouterLink } from "../../containers/router-link"
import { getWebAuth } from "../../lib/web-auth"

// The console's Feature flags tab: the operator organization's members, acting as it.
export const Route = createFileRoute("/admin/flags")({
  component: AdminFlagsRoute,
})

function AdminFlagsRoute() {
  return <AdminFlagsContainer auth={getWebAuth()} renderLink={RouterLink} />
}
