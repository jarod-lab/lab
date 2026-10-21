// The admin console's tabs (/admin/*): which a person may open, and where /admin lands. Pure.

/** What the signed-in person may open in the console. The server decides every call anyway. */
export interface AdminAccess {
  /** A platform admin (better-auth's user role `admin`): the Users tab. */
  platformAdmin: boolean
  /** The operator organization, when the person is a member of it: the Feature flags tab. */
  operatorOrganizationId: string | null
  /**
   * Support staff: the operator organization's role holds `support:read` (docs/support.md). The
   * Support tab (the support queue). Unknown reads as no.
   */
  supportStaff?: boolean
}

export const ADMIN_SECTIONS = [
  { id: "users", label: "Users" },
  { id: "flags", label: "Feature flags" },
  { id: "support", label: "Support" },
] as const

export type AdminSection = (typeof ADMIN_SECTIONS)[number]["id"]

function allows(access: AdminAccess, id: AdminSection): boolean {
  switch (id) {
    case "users":
      return access.platformAdmin
    case "flags":
      return access.operatorOrganizationId !== null
    case "support":
      // Support staff are the operator organization's members whose role holds support actions.
      return access.operatorOrganizationId !== null && access.supportStaff === true
  }
}

/** The tabs this person may open, with their hrefs. */
export function adminTabs(access: AdminAccess) {
  return ADMIN_SECTIONS.filter((section) => allows(access, section.id)).map((section) => ({
    id: section.id,
    label: section.label,
    href: `/admin/${section.id}`,
  }))
}

/** Whether the console has anything for this person: the sidebar shows its link only then. */
export function canOpenAdmin(access: AdminAccess): boolean {
  return adminTabs(access).length > 0
}

/** Where /admin lands: the first tab this person may open, else Users (which says it isn't theirs). */
export function adminLanding(access: AdminAccess): string {
  return adminTabs(access)[0]?.href ?? "/admin/users"
}

/** Breadcrumbs for an admin path: "Admin", then the tab's label. */
export function adminCrumbs(pathname: string): { label: string }[] {
  const id = /^\/admin\/([^/]+)/.exec(pathname)?.[1]
  const section = ADMIN_SECTIONS.find((item) => item.id === id)
  return [{ label: "Admin" }, ...(section ? [{ label: section.label }] : [])]
}
