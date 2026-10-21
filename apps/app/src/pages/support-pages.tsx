import type { ReactNode } from "react"

import { Button } from "@starter/ui/components/ui/button"
import type { RenderLink } from "@starter/ui/dplus/shell/link"
import { PageBody, PageHeader } from "@starter/ui/dplus/shell/page-header"
import { type SettingsTab, SettingsHeader } from "@starter/ui/dplus/shell/settings-header"

/**
 * The requester's support page (/account/support, and /account/support/$id where thread mail and
 * the "new reply" notification link): support's widget, inline.
 */
export function SupportTicketPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Support tickets" />
      <PageBody className="gap-4">{children}</PageBody>
    </div>
  )
}

/** The admin console's Support tab: the console's header and tabs, then the support queue. */
export function SupportAdminPage({
  tabs,
  notice,
  renderLink,
  children,
}: {
  /** The admin console's tabs this person may open (adminTabs). */
  tabs: SettingsTab[]
  /** Shown above the queue, e.g. which ticket a link was for. */
  notice?: ReactNode
  renderLink?: RenderLink
  children: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title="Admin"
        context="Support queue"
        tabs={tabs}
        activeTab="support"
        renderLink={renderLink}
      />
      <PageBody className="gap-4">
        {notice}
        {children}
      </PageBody>
    </div>
  )
}

/** The support access check failed for another reason than sign-in or staff: offer a retry. */
export function SupportAdminError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-xl flex-col items-start gap-3 px-4 py-16"
    >
      <p>Could not check your support access.</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
