import { createFileRoute, useRouter } from "@tanstack/react-router"

import { SupportTicketContainer } from "../../containers/support-ticket"
import { getWebAuth } from "../../lib/web-auth"

// The requester's support page: their tickets at /account/support, one ticket's thread at
// /account/support/$id (thread mail and the "new reply" notification link there:
// supportTicketPaths.requester in packages/auth/src/notifications.ts). One route, so moving between
// the list and a thread keeps the widget mounted while the URL follows it.
export const Route = createFileRoute("/account/support/{-$id}")({
  component: AccountSupportRoute,
})

function AccountSupportRoute() {
  const router = useRouter()
  const { id } = Route.useParams()
  const auth = getWebAuth()
  return auth.support ? (
    <SupportTicketContainer
      auth={auth}
      client={auth.support}
      ticketId={id}
      onNavigate={(href) => void router.navigate({ href })}
    />
  ) : null
}
