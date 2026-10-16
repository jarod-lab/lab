export type OrgNav = "home" | "agents" | "settings"

/** Which sidebar item a path belongs to, from its path under the org slug (undefined outside it). */
export function activeNavFor(pathname: string, slug: string): OrgNav | undefined {
  const rest = pathname.slice(`/${slug}`.length)
  if (rest === "" || rest === "/") return "home"
  if (rest === "/settings/agents" || rest.startsWith("/settings/agents/")) return "agents"
  if (rest.startsWith("/settings/")) return "settings"
  return undefined
}
