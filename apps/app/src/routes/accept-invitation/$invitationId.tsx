import { createFileRoute } from "@tanstack/react-router"

import { InvitationPage } from "../../pages/invitation-page"
import { previewInvitation } from "../../lib/invitation-preview"
import { getWebAuth } from "../../lib/web-auth"

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: InvitationRoute,
})

function InvitationRoute() {
  const { invitationId } = Route.useParams()
  return (
    <InvitationPage
      auth={getWebAuth()}
      invitationId={invitationId}
      loadPreview={previewInvitation}
    />
  )
}
