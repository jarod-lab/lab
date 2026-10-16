// Pure helpers for the API keys page. No network, no React.

/** Resources a key may hold. `run:approve` is a person's decision and is never granted to a key (access.ts). */
export const KEY_RESOURCES = ["project", "agent", "run"] as const
export type KeyResource = (typeof KEY_RESOURCES)[number]

const KEY_ACTIONS: Record<KeyResource, readonly string[]> = {
  project: ["create", "read", "update", "delete"],
  agent: ["create", "read", "update", "delete"],
  run: ["create", "read", "update", "steer"],
}

const RESOURCE_LABEL: Record<KeyResource, string> = {
  project: "Projects",
  agent: "Agents",
  run: "Runs",
}

const ACTION_LABEL: Record<string, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
  steer: "Steer",
}

export interface PermissionOption {
  /** "project:read", the form the server stores and returns. */
  key: string
  resource: KeyResource
  action: string
  label: string
}

/**
 * The permissions the picker offers, limited to what the caller may grant. `allows` answers one
 * `resource:action` for the caller's role (the server refuses anything beyond the caller's grants).
 */
export function permissionOptions(
  allows: (permission: Record<string, string[]>) => boolean,
): PermissionOption[] {
  return KEY_RESOURCES.flatMap((resource) =>
    KEY_ACTIONS[resource]
      .filter((action) => allows({ [resource]: [action] }))
      .map((action) => ({
        key: `${resource}:${action}`,
        resource,
        action,
        label: `${RESOURCE_LABEL[resource]}: ${ACTION_LABEL[action] ?? action}`,
      })),
  )
}

/** The selected option keys as the `{ resource: [action] }` record the server takes. */
export function toPermissionsRecord(selected: readonly string[]): Record<string, string[]> {
  const record: Record<string, string[]> = {}
  for (const key of selected) {
    const [resource, action] = key.split(":")
    if (!resource || !action) continue
    record[resource] = [...(record[resource] ?? []), action]
  }
  return record
}

/** The Access column: "Read only" when every permission is a read, otherwise "Read & write". */
export function accessSummary(access: readonly string[]): string {
  if (access.length === 0) return "No access"
  return access.every((permission) => permission.endsWith(":read")) ? "Read only" : "Read & write"
}

export const STALE_AFTER_DAYS = 90
const DAY_MS = 86_400_000

/**
 * A key nobody has used for 90 days. A key never used counts from when it was created. Keys used
 * recently are not flagged.
 */
export function isUnused(
  key: { lastUsedAt: string | null; createdAt: string },
  now: Date,
): boolean {
  const since = Date.parse(key.lastUsedAt ?? key.createdAt)
  if (Number.isNaN(since)) return false
  return now.getTime() - since >= STALE_AFTER_DAYS * DAY_MS
}

export const EXPIRY_OPTIONS = [
  { value: "", label: "No expiry" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
] as const

/** The copy above the one-time secret. The key is never shown again. */
export function secretNotice(name: string): string {
  return `Copy “${name}” now. You won't see this key again.`
}
