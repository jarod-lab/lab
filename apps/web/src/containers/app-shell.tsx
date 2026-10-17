import { useState, type ReactNode } from "react"

import { AppShell } from "@starter/ui/dplus/shell/app-shell"
import { AppSidebar, type NavItem } from "@starter/ui/dplus/shell/app-sidebar"
import { CommandPalette } from "@starter/ui/dplus/shell/command-palette"
import type { RenderLink } from "@starter/ui/dplus/shell/link"
import { Topbar, type Crumb } from "@starter/ui/dplus/shell/topbar"

import { getRunsApi } from "../lib/runs-api"
import { type ThemeChoice, toggledTheme, useThemeChoice } from "../lib/theme"
import type { WorkspaceAgentsApi } from "../lib/workspace-agents-api"
import type { WebAuth } from "../lib/web-auth"
import { useInboxCount, useRunningCount } from "./inbox"
import { paletteAction, paletteGroups } from "./palette-items"
import { RouterLink } from "./router-link"
import { ShortcutsDialog } from "./shortcuts-dialog"
import { useShellHotkeys } from "./hotkeys"
import {
  activeOrganization,
  toOrgSummaries,
  useMemberRoles,
  useOrganizationsQuery,
  useSessionQuery,
  usePinnedAgents,
  useSignOut,
} from "./shell-data"

export type AppShellContainerProps = {
  auth: WebAuth
  /** The organization slug from the URL. Null on account pages, which show the active organization. */
  slug: string | null
  /** Which sidebar item is active: "home", "agents" or "settings". */
  activeNav?: "home" | "agents" | "settings"
  /** The workspace agents, for the sidebar's pinned list. Pages that show none leave it out. */
  agents?: WorkspaceAgentsApi
  crumbs: Crumb[]
  /** Client navigation for app paths (the router's navigate). */
  onNavigate: (href: string) => void
  /** Runs after sign-out succeeds. */
  onSignedOut: () => void
  renderLink?: RenderLink
  children: ReactNode
}

/**
 * The app frame for every signed-in page: sidebar with the org picker, top bar, palette and the
 * shell's hotkeys. It reads the session and organizations itself; the routes pass only the slug.
 */
export function AppShellContainer({
  auth,
  slug,
  activeNav,
  agents,
  crumbs,
  onNavigate,
  onSignedOut,
  renderLink = RouterLink,
  children,
}: AppShellContainerProps) {
  const session = useSessionQuery(auth)
  const organizations = useOrganizationsQuery(auth)
  const roles = useMemberRoles(auth, organizations.data)
  const orgs = organizations.data ?? []
  const current =
    (slug ? orgs.find((org) => org.slug === slug) : undefined) ??
    activeOrganization(session.data, orgs)
  const currentSlug = current?.slug ?? null
  // The pinned list needs the session on this organization (the server refuses a mismatch).
  const pinnedAgents = usePinnedAgents({
    api: agents,
    organizationId: current?.id ?? null,
    slug: currentSlug,
    ready: session.data?.activeOrganizationId === current?.id,
  })
  // The "needs you" count: approvals waiting for a person here (the server answers 0 to anyone who can't decide).
  const inboxCount = useInboxCount({
    api: getRunsApi(),
    organizationId: current?.id ?? null,
    ready: session.data?.activeOrganizationId === current?.id,
  })
  const running = useRunningCount({
    api: getRunsApi(),
    organizationId: current?.id ?? null,
    ready: session.data?.activeOrganizationId === current?.id,
  })
  const [theme, setTheme] = useThemeChoice()
  const signOut = useSignOut(auth)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const navItems: NavItem[] = currentSlug
    ? [
        {
          id: "home",
          label: "Home",
          href: `/${currentSlug}`,
          shortcut: ["G", "H"],
          // "N running" with the running mark, and the "needs you" count (solar) when people are waiting.
          status:
            running.running > 0
              ? {
                  state: "running",
                  label: `${running.running}${running.more ? "+" : ""} running`,
                }
              : undefined,
          count: inboxCount > 0 ? { value: inboxCount, label: "waiting" } : undefined,
        },
        {
          id: "agents",
          label: "Agents",
          href: `/${currentSlug}/settings/agents`,
          shortcut: ["G", "A"],
        },
        {
          id: "settings",
          label: "Settings",
          href: `/${currentSlug}/settings/general`,
          shortcut: ["G", "O"],
        },
      ]
    : []

  useShellHotkeys({
    homeHref: currentSlug ? `/${currentSlug}` : null,
    agentsHref: currentSlug ? `/${currentSlug}/settings/agents` : null,
    settingsHref: currentSlug ? `/${currentSlug}/settings/general` : null,
    onOpenPalette: () => setPaletteOpen(true),
    onOpenShortcuts: () => setShortcutsOpen(true),
    onToggleTheme: () => setTheme(toggledTheme(theme)),
    onSystemTheme: () => setTheme("system"),
    onGo: onNavigate,
  })

  const status = organizations.isError ? "error" : organizations.isPending ? "loading" : "ready"
  const user = session.data?.user ?? { id: "", name: "", email: "" }

  const sidebar = (
    <AppSidebar
      org={{
        orgs: toOrgSummaries(orgs, roles),
        activeOrgId: current?.id ?? null,
        status,
        hrefFor: (org) => `/${org.slug}`,
        settingsHref: currentSlug ? `/${currentSlug}/settings/general` : "/new",
        createHref: "/new",
        onRetry: () => void organizations.refetch(),
      }}
      nav={navItems}
      pinnedAgents={pinnedAgents}
      activeId={activeNav}
      support={{ href: "/llms.txt", label: "Agent docs" }}
      account={{
        user: { name: user.name, email: user.email },
        theme,
        onThemeChange: (choice: ThemeChoice) => setTheme(choice),
        personalSettingsHref: "/account/profile",
        securityHref: "/account/security",
        onShowShortcuts: () => setShortcutsOpen(true),
        onSignOut: () => signOut.mutate(undefined, { onSuccess: onSignedOut }),
      }}
    />
  )

  const topbar = (
    <Topbar
      crumbs={crumbs}
      onOpenSearch={() => setPaletteOpen(true)}
      inbox={{
        count: inboxCount,
        onOpen: currentSlug ? () => onNavigate(`/${currentSlug}?status=needs_you`) : undefined,
      }}
      showMenuButton
    />
  )

  return (
    <>
      <AppShell sidebar={sidebar} topbar={topbar} renderLink={renderLink}>
        {children}
      </AppShell>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={paletteGroups({ current: current ?? null, organizations: orgs })}
        onSelect={(id) => {
          const action = paletteAction(id)
          if (!action) return
          if (action.kind === "navigate") onNavigate(action.href)
          else setTheme(action.choice)
        }}
        // No agent backend is wired yet: the entry closes the palette and nothing else.
        onAskAgent={() => undefined}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  )
}
