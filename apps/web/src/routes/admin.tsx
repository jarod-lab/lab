import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"

import { AdminContainer } from "../containers/admin"
import { adminSessionQuery } from "../containers/admin-data"
import { RouterLink } from "../containers/router-link"
import { getAdminApi } from "../lib/admin-api"

// The platform admin page. Signed-out visitors go to sign-in and come back here. Anyone signed in gets
// the page, and the page itself answers "Not available" unless the session is a platform admin.
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    if (typeof window === "undefined") return
    const session = await context.queryClient.ensureQueryData(adminSessionQuery(getAdminApi()))
    if (!session) throw redirect({ to: "/sign-in", search: { next: "/admin" } })
  },
  component: AdminRoute,
})

function AdminRoute() {
  const router = useRouter()
  return (
    <AdminContainer
      api={getAdminApi()}
      onNavigate={(href) => void router.navigate({ href })}
      renderLink={RouterLink}
    />
  )
}
