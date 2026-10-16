import type { Decorator } from "@storybook/react-vite"
import type * as React from "react"
import { useEffect } from "react"
import { AppShell } from "../shell/app-shell"
import { AppSidebar, type AppSidebarProps } from "../shell/app-sidebar"
import { Topbar, type Crumb } from "../shell/topbar"

// Story-only layout helpers for the "Variants" stories: one labelled row per variant, so every
// option of a component can be checked against the D+ design system page at a glance.

export function VariantTable({
  columns,
  children,
}: {
  columns?: string[]
  children: React.ReactNode
}) {
  return (
    <div
      className="grid items-center gap-x-6 gap-y-4 bg-background p-6 text-foreground"
      style={{ gridTemplateColumns: `9rem repeat(${columns?.length ?? 1}, max-content)` }}
    >
      {columns && (
        <>
          <span />
          {columns.map((c) => (
            <span key={c} className="type-eyebrow text-muted-foreground">
              {c}
            </span>
          ))}
        </>
      )}
      {children}
    </div>
  )
}

export function VariantRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <code className="type-mono text-muted-foreground">{name}</code>
      {children}
    </>
  )
}

export function Stack({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`flex max-w-xl flex-col gap-4 bg-background p-6 text-foreground ${className ?? ""}`}
    >
      {children}
    </div>
  )
}

/** Dark theme for a story. Menus portal to <body>, so the class goes on <html>. */
export const withDark: Decorator = (Story) => {
  useEffect(() => {
    document.documentElement.classList.add("dark")
    return () => document.documentElement.classList.remove("dark")
  }, [])
  return <Story />
}

// Fixture data for the page stories. Names are the board's; nothing here is real.
export const demoOrgs: AppSidebarProps["org"]["orgs"] = [
  { id: "acme", name: "Acme Inc", slug: "acme", role: "Owner" },
  { id: "northwind", name: "Northwind Labs", slug: "northwind", role: "Viewer" },
  { id: "jordan", name: "Jordan's workspace", slug: "jordan", role: "Owner", personal: true },
]

export const demoNav: AppSidebarProps["nav"] = [
  { id: "home", label: "Home", href: "#home", shortcut: ["G", "H"] },
  { id: "agents", label: "Agents", href: "#agents", shortcut: ["G", "A"] },
  {
    id: "runs",
    label: "Runs",
    href: "#runs",
    status: { state: "running", label: "2 running" },
  },
  {
    id: "approvals",
    label: "Approvals",
    href: "#approvals",
    count: { value: 3, label: "waiting" },
  },
  { id: "settings", label: "Settings", href: "#settings", shortcut: ["G", "O"] },
]

export const demoPinned: AppSidebarProps["pinnedAgents"] = [
  { id: "release-triage", name: "Release triage", href: "#release-triage", state: "running" },
  {
    id: "support-drafts",
    name: "Support drafts",
    href: "#support-drafts",
    state: "needs-you",
  },
  {
    id: "weekly-digest",
    name: "Weekly digest",
    href: "#weekly-digest",
    state: "queued",
    label: "Idle",
  },
]

export const demoAccount: AppSidebarProps["account"] = {
  user: { name: "Jordan Lee", email: "jordan@acme.dev" },
  theme: "light",
  onThemeChange: () => {},
  personalSettingsHref: "#account-profile",
  securityHref: "#account-security",
  onShowShortcuts: () => {},
  onSignOut: () => {},
}

/** The real shell wired to fixtures, for page stories. `menu` opens a menu for the board's frame. */
export function DemoShell({
  active,
  crumbs,
  menu = "none",
  announce = true,
  children,
}: {
  active: string
  crumbs: Crumb[]
  menu?: "none" | "org" | "user"
  announce?: boolean
  children: React.ReactNode
}) {
  return (
    <AppShell
      sidebar={
        <AppSidebar
          org={{
            orgs: demoOrgs,
            activeOrgId: "acme",
            hrefFor: (o) => `#${o.slug}`,
            settingsHref: "#org-settings",
            createHref: "#new",
            open: menu === "org",
          }}
          nav={demoNav}
          activeId={active}
          pinnedAgents={demoPinned}
          announcement={
            announce
              ? {
                  id: "pull-requests",
                  badge: "NEW",
                  title: "Agents can open pull requests",
                  href: "#post",
                  linkLabel: "Read the post",
                }
              : undefined
          }
          support={{ href: "#support" }}
          account={{ ...demoAccount, open: menu === "user" }}
        />
      }
      topbar={<Topbar crumbs={crumbs} showMenuButton inbox={{ count: 3 }} />}
    >
      {children}
    </AppShell>
  )
}
