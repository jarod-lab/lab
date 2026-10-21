import { type SupportFetchClient, SupportWidget } from "@byo-oss/support/react"

// The launcher sits in the top bar beside the bell, so it takes the bar's height (44px on a phone).
// Support appends this to its own launcher classes (a plain join, no merge), so it only adds what
// the package's don't set.
const LAUNCHER_CLASS = "h-11 shrink-0 font-medium sm:h-10"

export interface SupportWidgetContainerProps {
  client: SupportFetchClient
  /** The organization the page shows: new tickets can be shared with it. */
  organizationId?: string
  onNavigate: (href: string) => void
  /** Poll interval in ms; tests pass 0. */
  pollInterval?: number
}

/**
 * The customer's support widget (@byo-oss/support): their tickets, a new ticket, and the thread
 * with the support staff. The app shell mounts it for signed-in people; support decides what they see.
 */
export function SupportWidgetContainer({
  client,
  organizationId,
  onNavigate,
  pollInterval,
}: SupportWidgetContainerProps) {
  return (
    <SupportWidget
      client={client}
      organizationId={organizationId}
      onNavigate={onNavigate}
      buttonClassName={LAUNCHER_CLASS}
      {...(pollInterval === undefined ? {} : { pollInterval })}
    />
  )
}
