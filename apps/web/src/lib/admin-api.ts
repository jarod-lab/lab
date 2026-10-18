import { makeAuthClient, WebError } from "./web-auth"

// The admin page's calls, through better-auth's admin client (adminClient in packages/auth/src/client.ts).
// The server refuses every call from a non-admin session (and from an impersonated one, for the
// impersonation calls) whatever the page does, so nothing here decides access.

export interface AdminUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: string | null
  banned: boolean
  banReason: string | null
  /** ISO time the ban ends, or null for a permanent ban (or no ban). */
  banExpires: string | null
  createdAt: string
}

export interface AdminListPage {
  users: AdminUser[]
  total: number
}

export interface AdminSession {
  userId: string
  name: string
  email: string
  /** "admin" for a platform admin; "user" otherwise. */
  role: string
  /** The admin's user id while impersonating someone; null otherwise. */
  impersonatedBy: string | null
}

export type AdminRole = "user" | "admin"

export interface AdminApi {
  /** The current session, or null when signed out. */
  getSession(): Promise<AdminSession | null>
  listUsers(query: { search: string; offset: number; limit: number }): Promise<AdminListPage>
  banUser(input: { userId: string; reason?: string; expiresInSeconds?: number }): Promise<void>
  unbanUser(userId: string): Promise<void>
  impersonateUser(userId: string): Promise<void>
  stopImpersonating(): Promise<void>
  revokeUserSessions(userId: string): Promise<void>
  setRole(input: { userId: string; role: AdminRole }): Promise<void>
}

type Failable = {
  data: unknown
  error: { message?: string; status?: number; code?: string } | null
}

const unwrap = <T>(result: Failable, fallback: string): T => {
  if (result.error) {
    throw new WebError(
      result.error.message || fallback,
      result.error.status ?? 0,
      result.error.code,
    )
  }
  return result.data as T
}

const iso = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return null
  const date = new Date(value as string | number | Date)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const toUser = (raw: Record<string, unknown>): AdminUser => ({
  id: String(raw.id),
  name: String(raw.name ?? ""),
  email: String(raw.email ?? ""),
  emailVerified: raw.emailVerified === true,
  role: typeof raw.role === "string" ? raw.role : null,
  banned: raw.banned === true,
  banReason: typeof raw.banReason === "string" ? raw.banReason : null,
  banExpires: iso(raw.banExpires),
  createdAt: iso(raw.createdAt) ?? "",
})

/** The browser implementation. Same-origin, like web-auth.ts: the session cookie goes with each call. */
export function createAdminApi(baseURL?: string, fetchImpl?: typeof fetch): AdminApi {
  const client = makeAuthClient(baseURL, fetchImpl)

  return {
    async getSession() {
      const result = await client.getSession()
      if (!result.data) return null
      const { user, session } = result.data as unknown as {
        user: Record<string, unknown>
        session: Record<string, unknown>
      }
      return {
        userId: String(user.id),
        name: String(user.name ?? ""),
        email: String(user.email ?? ""),
        role: typeof user.role === "string" ? user.role : "user",
        impersonatedBy: typeof session.impersonatedBy === "string" ? session.impersonatedBy : null,
      }
    },
    async listUsers(query) {
      const body = unwrap<{ users: Record<string, unknown>[]; total: number }>(
        await client.admin.listUsers({
          query: {
            searchValue: query.search === "" ? undefined : query.search,
            searchField: "email",
            searchOperator: "contains",
            limit: query.limit,
            offset: query.offset,
            sortBy: "createdAt",
            sortDirection: "desc",
          },
        }),
        "Could not load users",
      )
      return { users: body.users.map(toUser), total: body.total }
    },
    async banUser({ userId, reason, expiresInSeconds }) {
      unwrap(
        await client.admin.banUser({
          userId,
          banReason: reason || undefined,
          // better-auth takes seconds (routes.mjs: getDate(banExpiresIn, "sec")).
          banExpiresIn: expiresInSeconds,
        }),
        "Could not ban this user",
      )
    },
    async unbanUser(userId) {
      unwrap(await client.admin.unbanUser({ userId }), "Could not unban this user")
    },
    async impersonateUser(userId) {
      unwrap(await client.admin.impersonateUser({ userId }), "Could not impersonate this user")
    },
    async stopImpersonating() {
      unwrap(await client.admin.stopImpersonating(), "Could not stop impersonating")
    },
    async revokeUserSessions(userId) {
      unwrap(await client.admin.revokeUserSessions({ userId }), "Could not sign this user out")
    },
    async setRole({ userId, role }) {
      unwrap(await client.admin.setRole({ userId, role }), "Could not change the role")
    },
  }
}

let shared: AdminApi | undefined

/** The page's admin API, created on first use in the browser. */
export function getAdminApi(): AdminApi {
  shared ??= createAdminApi(typeof window === "undefined" ? undefined : window.location.origin)
  return shared
}

/** Paths the admin client calls, for the method/path table test. */
export const ADMIN_PATHS = {
  listUsers: "/api/auth/admin/list-users",
  banUser: "/api/auth/admin/ban-user",
  unbanUser: "/api/auth/admin/unban-user",
  impersonateUser: "/api/auth/admin/impersonate-user",
  stopImpersonating: "/api/auth/admin/stop-impersonating",
  revokeUserSessions: "/api/auth/admin/revoke-user-sessions",
  setRole: "/api/auth/admin/set-role",
} as const
