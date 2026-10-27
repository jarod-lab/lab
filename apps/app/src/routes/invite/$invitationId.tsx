import { createFileRoute } from "@tanstack/react-router"

import { InvitationPage } from "../../pages/invitation-page"
import { previewInvitation } from "../../lib/invitation-preview"
import { getWebAuth } from "../../lib/web-auth"

// Alias of /accept-invitation/:id (decision D1): the link in invitation emails may use either path.
export const Route = createFileRoute("/invite/$invitationId")({
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
