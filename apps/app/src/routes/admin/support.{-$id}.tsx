import { createFileRoute, useRouter } from "@tanstack/react-router"

import { RouterLink } from "../../containers/router-link"
import { AdminSupportContainer } from "../../containers/support-admin"
import { getWebAuth } from "../../lib/web-auth"

// The console's Support tab: the support queue, for support staff. One route for the queue and an
// open ticket (`/admin/support/$id`, where staff notifications link: supportTicketPaths.staff in
// packages/auth/src/notifications.ts), so opening a ticket keeps the queue mounted, with its search,
// filters and selection.
export const Route = createFileRoute("/admin/support/{-$id}")({
  component: AdminSupportRoute,
})

function AdminSupportRoute() {
  const router = useRouter()
  const { id } = Route.useParams()
  return (
    <AdminSupportContainer
      auth={getWebAuth()}
      ticketId={id}
      onNavigate={(href) => void router.navigate({ href })}
      renderLink={RouterLink}
    />
  )
}
