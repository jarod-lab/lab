import { createFileRoute } from "@tanstack/react-router"

import { InvitationPage } from "../../pages/invitation-page"
import { getWebAuth } from "../../lib/web-auth"

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: InvitationRoute,
})

function InvitationRoute() {
  const { invitationId } = Route.useParams()
  return <InvitationPage auth={getWebAuth()} invitationId={invitationId} />
}
