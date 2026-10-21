import { type SupportFetchClient, SupportWidget } from "@byo-oss/support/react"

import type { WebAuth } from "../lib/web-auth"
import { SUPPORT_TICKETS_PATH } from "../lib/support-api"
import { SupportTicketPage } from "../pages/support-pages"
import { activeOrganization, useOrganizationsQuery, useSessionQuery } from "./shell-data"

export interface SupportTicketContainerProps {
  auth: WebAuth
  /** Support's client (`WebAuth.support`). */
  client: SupportFetchClient
  /** The ticket the URL names (/account/support/$id); unset, the list. */
  ticketId?: string
  onNavigate: (href: string) => void
  /** Poll interval in ms; tests pass 0. */
  pollInterval?: number
}

/**
 * The requester's support page: support's widget inline, on the thread the URL names or their
 * ticket list. Opening a ticket, creating one and Back move the URL with it (onTicketChange), so a
 * reload or a shared link lands on the same view. A ticket they can't read shows the thread's error.
 * New tickets from here are for the active organization, as from the top bar's widget.
 */
export function SupportTicketContainer({
  auth,
  client,
  ticketId,
  onNavigate,
  pollInterval,
}: SupportTicketContainerProps) {
  const session = useSessionQuery(auth)
  const organizations = useOrganizationsQuery(auth)
  const current = activeOrganization(session.data, organizations.data ?? [])
  return (
    <SupportTicketPage>
      <SupportWidget
        client={client}
        variant="inline"
        ticketId={ticketId ?? null}
        onTicketChange={(next) =>
          onNavigate(
            next ? `${SUPPORT_TICKETS_PATH}/${encodeURIComponent(next)}` : SUPPORT_TICKETS_PATH,
          )
        }
        organizationId={current?.id}
        onNavigate={onNavigate}
        {...(pollInterval === undefined ? {} : { pollInterval })}
      />
    </SupportTicketPage>
  )
}
