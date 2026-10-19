// Query keys for the platform admin page (/admin). Account-level, not organization-scoped: the admin
// acts across every organization. Every mutation invalidates `adminKeys.users()`.

export interface AdminListQuery {
  search: string
  offset: number
  limit: number
}

export const adminKeys = {
  /** The signed-in session as the admin page reads it (role, and who is impersonated, if anyone). */
  session: () => ["admin", "session"] as const,
  /** Every user list, any search or page. */
  users: () => ["admin", "users"] as const,
  list: (query: AdminListQuery) => ["admin", "users", query] as const,
}
