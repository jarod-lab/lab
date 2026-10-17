import { ORG_SETTINGS_SECTIONS } from "./org-settings"

export type OrgNav = "home" | "agents" | "settings"

/** Which sidebar item a path belongs to, from its path under the org slug (undefined outside it). */
export function activeNavFor(pathname: string, slug: string): OrgNav | undefined {
  const rest = pathname.slice(`/${slug}`.length)
  // A run lives under Home: the org's run list is the home page.
  if (rest === "" || rest === "/" || rest.startsWith("/runs/")) return "home"
  if (rest === "/settings/agents" || rest.startsWith("/settings/agents/")) return "agents"
  if (rest.startsWith("/settings/")) return "settings"
  return undefined
}

/** Breadcrumbs after the organization name for a settings page: "Settings", then the tab's label. */
export function settingsCrumbs(pathname: string, slug: string): { label: string }[] {
  const rest = pathname.slice(`/${slug}`.length)
  if (rest.startsWith("/runs/")) return [{ label: "Runs" }]
  const match = /^\/settings\/([^/]+)/.exec(rest)
  const section = ORG_SETTINGS_SECTIONS.find((item) => item.id === match?.[1])
  return section ? [{ label: "Settings" }, { label: section.label }] : []
}
