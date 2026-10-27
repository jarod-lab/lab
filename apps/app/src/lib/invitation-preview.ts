import { payload, productClient, type ResponseBody } from "./product-client"

/** What the invitation link shows before anyone is signed in (`get_invitation_preview`). */
export type InvitationPreview = ResponseBody<"get_invitation_preview">

/**
 * The invitation behind a link, read with no session. An unknown id rejects with a 404 WebError,
 * so the page can tell "no such invitation" from a failed request.
 */
export function previewInvitation(
  invitationId: string,
  fetchImpl?: typeof fetch,
): Promise<InvitationPreview> {
  return payload(
    productClient(undefined, fetchImpl).GET("/v1/invitations/{id}/preview", {
      params: { path: { id: invitationId } },
    }),
  )
}
