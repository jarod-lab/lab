import { cn } from "cn"
import type * as React from "react"
import { SidebarProvider } from "../../components/ui/sidebar"
import { type RenderLink, ShellLinkProvider } from "./link"

export type AppShellProps = {
  /** Usually `<AppSidebar />`. Beside `md` it sits in the layout; below, it opens as a drawer. */
  sidebar: React.ReactNode
  /** Usually `<Topbar showMenuButton … />`. */
  topbar: React.ReactNode
  children: React.ReactNode
  /** Target of the skip link, which is the first focusable element. */
  skipLinkLabel?: string
  /** Router link for every shell component under this shell. */
  renderLink?: RenderLink
  className?: string
}

/**
 * The app frame: sidebar, top bar and a `<main id="main">`. The skip link is the first stop for
 * keyboard users. At phone width the sidebar becomes a drawer, opened from the top bar's menu button.
 */
export function AppShell({
  sidebar,
  topbar,
  children,
  skipLinkLabel = "Skip to content",
  renderLink,
  className,
}: AppShellProps) {
  const frame = (
    <SidebarProvider
      className={cn(
        "h-svh min-h-0 overflow-hidden bg-background text-[15px] text-foreground",
        className,
      )}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        {skipLinkLabel}
      </a>
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main
          id="main"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col overflow-auto outline-none"
        >
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
  return renderLink ? <ShellLinkProvider renderLink={renderLink}>{frame}</ShellLinkProvider> : frame
}
