// Pure helpers for the organization settings page. No network, no React.

/** The roles a new invitation can start with (the board's "Default role for new invites"). */
export const INVITE_ROLES = ["admin", "member", "viewer"] as const
export type InviteRole = (typeof INVITE_ROLES)[number]

export const INVITE_ROLE_LABEL: Record<InviteRole, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
}

export const DEFAULT_INVITE_ROLE: InviteRole = "member"

/** Where the default invite role lives: the organization's `metadata` (JSON on the server). */
export const INVITE_ROLE_METADATA_KEY = "defaultInviteRole"

/** The settings tabs for an organization. Pages behind the later ones don't exist yet; the links still work. */
export const ORG_SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "api-keys", label: "API keys" },
  { id: "billing", label: "Billing" },
  { id: "agents", label: "Agents" },
  { id: "security", label: "Security" },
] as const

/**
 * better-auth stores organization metadata as JSON text and may hand it back as a string or as an
 * object, depending on the path. Anything that isn't an object reads as empty.
 */
export function parseMetadata(value: unknown): Record<string, unknown> {
  let parsed: unknown = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      return {}
    }
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  return { ...(parsed as Record<string, unknown>) }
}

/** The stored default invite role, or Member when none is stored (or the stored one is unknown). */
export function defaultInviteRoleOf(metadata: unknown): InviteRole {
  const stored = parseMetadata(metadata)[INVITE_ROLE_METADATA_KEY]
  return INVITE_ROLES.find((role) => role === stored) ?? DEFAULT_INVITE_ROLE
}

/**
 * The metadata to save. better-auth replaces the whole object on update, so every other key the
 * server holds is carried over.
 */
export function withDefaultInviteRole(
  metadata: unknown,
  role: InviteRole,
): Record<string, unknown> {
  return { ...parseMetadata(metadata), [INVITE_ROLE_METADATA_KEY]: role }
}

/** A stored role string ("admin,member") as its parts. */
export function roleParts(role: string): string[] {
  return role
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export type MemberSummary = { id: string; userId: string; role: string }

/** How many members hold the owner role. */
export function ownerCount(members: MemberSummary[]): number {
  return members.filter((member) => roleParts(member.role).includes("owner")).length
}

/** Human copy for a slug change: the old address stops working. */
export function slugChangeWarning(host: string, oldSlug: string): string {
  return `Changing this breaks existing links to ${host}/${oldSlug}.`
}

/** The count to show in copy, or a placeholder while it is not known. */
export function countOrPlaceholder(count: number | undefined): string {
  return count === undefined ? "[PLACEHOLDER]" : String(count)
}

/**
 * The settings tabs for an organization's pages, with each tab's href. `counts` names a tab's quiet
 * count by section id (e.g. `{ members: "12" }`).
 */
export function settingsTabs(slug: string, counts: Partial<Record<string, string>> = {}) {
  return ORG_SETTINGS_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    href: `/${slug}/settings/${section.id}`,
    count: counts[section.id],
  }))
}
