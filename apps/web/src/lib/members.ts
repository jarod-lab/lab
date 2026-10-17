// Pure helpers for the members page. No network, no React. Every permission is answered by the
// caller with the plugin's own check (`allows`), never by a role table written here.

import { type InviteRole, roleParts } from "./org-settings"

/** A permission to test: resource to actions, the shape `roleAllows` takes. */
export type Permission = Record<string, string[]>
export type Allows = (permission: Permission) => boolean

/** Roles in the order the page lists them. Owner is listed for the matrix only. */
export const MATRIX_ROLES = ["owner", "admin", "member", "viewer"] as const
export type MatrixRole = (typeof MATRIX_ROLES)[number]

export const MATRIX_ROLE_LABEL: Record<MatrixRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
}

/** The stored role string ("admin,member") as its highest role; a role we don't know is a viewer. */
export function topRoleOf(role: string): MatrixRole {
  const parts = roleParts(role)
  return MATRIX_ROLES.find((candidate) => parts.includes(candidate)) ?? "viewer"
}

/** The label for a stored role string: its highest role's name. */
export function roleLabelOf(role: string): string {
  return MATRIX_ROLE_LABEL[topRoleOf(role)]
}

/**
 * The role matrix: each row is one board label mapped to the catalog actions it needs, and each
 * cell is the plugin's answer for that role. Labels are the board's; the actions are the catalog's.
 * The board's "API keys and billing" row needs both grants in one set, which a single role must hold
 * (owners and admins do; members and viewers hold neither).
 */
export const PERMISSION_MATRIX: { label: string; permission: Permission }[] = [
  { label: "See agents, runs, settings", permission: { agent: ["read"], run: ["read"] } },
  { label: "Start runs, approve actions", permission: { run: ["create", "approve"] } },
  { label: "Create and edit agents", permission: { agent: ["create", "update"] } },
  { label: "Invite and manage members", permission: { member: ["update", "delete"] } },
  { label: "API keys and billing", permission: { apiKey: ["create"], subscription: ["update"] } },
  { label: "Delete or transfer the org", permission: { organization: ["delete"] } },
]

export interface MatrixRowView {
  label: string
  cells: Record<MatrixRole, boolean>
}

/** The matrix, every cell computed by `allows(role, permission)`. */
export function permissionMatrix(allows: (role: MatrixRole, permission: Permission) => boolean) {
  return PERMISSION_MATRIX.map(
    (row): MatrixRowView => ({
      label: row.label,
      cells: {
        owner: allows("owner", row.permission),
        admin: allows("admin", row.permission),
        member: allows("member", row.permission),
        viewer: allows("viewer", row.permission),
      },
    }),
  )
}

export const INVITE_PERMISSION: Permission = { invitation: ["create"] }
export const SEE_SECURITY: Permission = { member: ["read"] }
export const CHANGE_ROLE: Permission = { member: ["update"] }
export const REMOVE_MEMBER: Permission = { member: ["delete"] }
export const CANCEL_INVITATION: Permission = { invitation: ["cancel"] }
export const RESET_TWO_FACTOR: Permission = { twoFactor: ["reset"] }

/** Owners are fixed in the table: only an owner can change an owner, so the menu never offers it. */
export function isOwner(role: string): boolean {
  return roleParts(role).includes("owner")
}

export interface MemberAbilities {
  /** The caller's own row: leaving and transfer live on the General page. */
  isSelf: boolean
  role: string
  twoFactorEnabled?: boolean
}

/** Whether the role menu is offered: not yourself, not an owner, and member:update. */
export function canChangeRole(member: MemberAbilities, allows: Allows): boolean {
  return !member.isSelf && !isOwner(member.role) && allows(CHANGE_ROLE)
}

/** Whether Remove is offered: not yourself, not an owner, and member:delete. */
export function canRemoveMember(member: MemberAbilities, allows: Allows): boolean {
  return !member.isSelf && !isOwner(member.role) && allows(REMOVE_MEMBER)
}

/** Whether two-factor can be turned off for a member: owners only, another person, and it is on. */
export function canResetTwoFactor(member: MemberAbilities, allows: Allows): boolean {
  return !member.isSelf && member.twoFactorEnabled === true && allows(RESET_TWO_FACTOR)
}

/** The roles an invitation or a role change can name. Owner is never offered here. */
export const ASSIGNABLE_ROLES: InviteRole[] = ["admin", "member", "viewer"]

/** The exact consequence of removing a member (AGENTS.md: member-grants). */
export function removeConsequence(name: string): string {
  return `${name} loses access now; their agent grants in this org end. Their API keys stay: they belong to the org.`
}

/** The exact consequence of turning off two-factor. */
export function resetTwoFactorConsequence(name: string): string {
  return `${name}'s authenticator and backup codes are removed. They sign in with a password alone until they set two-factor up again.`
}

const DAY_MS = 86_400_000

export type InvitationState = "pending" | "expired"

/** An invitation past its expiry is expired, whatever its stored status says. */
export function invitationState(expiresAt: string, now: Date): InvitationState {
  const at = Date.parse(expiresAt)
  return !Number.isNaN(at) && at <= now.getTime() ? "expired" : "pending"
}

/** "Sent 2 days ago" / "Sent just now", from the invitation's creation time. */
export function sentCopy(createdAt: string | undefined, now: Date): string {
  if (!createdAt) return "Sent"
  const sent = Date.parse(createdAt)
  if (Number.isNaN(sent)) return "Sent"
  return `Sent ${relativeCopy(sent, now)}`
}

/** "expires in 5 days" for a pending invitation; expired ones say when they expired. */
export function expiryCopy(expiresAt: string, now: Date): string {
  const at = Date.parse(expiresAt)
  if (Number.isNaN(at)) return ""
  const days = Math.ceil((at - now.getTime()) / DAY_MS)
  return days > 0 ? `expires in ${days} ${days === 1 ? "day" : "days"}` : "expired"
}

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** A moment as "just now", "2 hours ago", "yesterday": relative to `now`. */
export function relativeCopy(at: number, now: Date): string {
  const seconds = Math.round((at - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return "just now"
  if (abs < 3600) return formatter.format(Math.round(seconds / 60), "minute")
  if (abs < 86_400) return formatter.format(Math.round(seconds / 3600), "hour")
  return formatter.format(Math.round(seconds / 86_400), "day")
}

/** Last active: "Now" for this moment, a relative time, or "Never" when nothing is recorded. */
export function lastActiveCopy(lastActiveAt: string | null | undefined, now: Date): string {
  if (!lastActiveAt) return "Never"
  const at = Date.parse(lastActiveAt)
  if (Number.isNaN(at)) return "Never"
  return now.getTime() - at < 60_000 ? "Now" : relativeCopy(at, now)
}

export interface ParsedEmails {
  emails: string[]
  invalid: string[]
}

// One address: something@something.tld, no spaces. The server checks the rest.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * "a@x.com, b@y.com" (commas, spaces or new lines) as addresses. Duplicates count once; anything
 * that isn't an address is returned in `invalid` so the page can name it.
 */
export function parseInviteEmails(text: string): ParsedEmails {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const seen = new Set<string>()
  const emails: string[] = []
  const invalid: string[] = []
  for (const part of parts) {
    if (!EMAIL.test(part)) {
      invalid.push(part)
      continue
    }
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    emails.push(part)
  }
  return { emails, invalid }
}

/** Initials for the avatar: the first letters of the first two words of the name, or the email. */
export function initialsOf(name: string, email: string): string {
  const source = name.trim() || email.trim()
  const words = source
    .replace(/\(.*?\)/g, "")
    .split(/[\s@._-]+/)
    .filter(Boolean)
  const letters = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("")
  return letters || "?"
}

/** Above this many members the list is virtualized once it is expanded. */
export const LONG_LIST = 50
/** The rows shown before "Show all N members". */
export const PREVIEW_ROWS = 8
