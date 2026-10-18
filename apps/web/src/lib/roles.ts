/**
 * The one place that reads a stored role string. The server keeps a member's roles as a
 * comma-separated string ("admin,member"); everything in the web app that asks about a role goes
 * through these helpers.
 */

/** A stored role string as its parts: trimmed, without empty entries. */
export function roleParts(role: string): string[] {
  return role
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/** Whether a stored role string includes `name` ("owner", "admin", ...). */
export function hasRole(role: string, name: string): boolean {
  return roleParts(role).includes(name)
}

/** Whether a stored role string includes the owner role. Owners are fixed in the permission table. */
export function isOwner(role: string): boolean {
  return hasRole(role, "owner")
}
