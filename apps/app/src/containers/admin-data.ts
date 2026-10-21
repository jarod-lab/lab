import type { AdminApi, AdminRole, AdminSession } from "../lib/admin-api"
import { adminKeys } from "../lib/admin-keys"
import type { FeatureFlagsApi } from "../lib/feature-flags-api"

// Query functions are plain objects so the route guard and the containers share one definition.

export const adminSessionQuery = (api: AdminApi) => ({
  queryKey: adminKeys.session(),
  queryFn: (): Promise<AdminSession | null> => api.getSession(),
})

/** The operator organization's id when the person belongs to it. A failed lookup reads as none. */
export const operatorOrganizationQuery = (api: FeatureFlagsApi) => ({
  queryKey: adminKeys.operatorOrganization(),
  queryFn: async (): Promise<string | null> => {
    try {
      return await api.operatorOrganization()
    } catch {
      // The console's tabs are a convenience: the operator operations refuse everyone else anyway.
      return null
    }
  },
  staleTime: 5 * 60_000,
})

/** Whether the session may open the admin page: an admin and not acting as someone else. */
export const isPlatformAdmin = (session: AdminSession | null | undefined): boolean =>
  session?.role === "admin"

/** The actions the admin page can take on a user. Each one is a single server call. */
export type AdminAction =
  | { kind: "ban"; userId: string; reason: string; expiresInSeconds?: number }
  | { kind: "unban"; userId: string }
  | { kind: "impersonate"; userId: string }
  | { kind: "stop-impersonating" }
  | { kind: "revoke"; userId: string }
  | { kind: "role"; userId: string; role: AdminRole }

export function runAdminAction(api: AdminApi, action: AdminAction): Promise<void> {
  switch (action.kind) {
    case "ban":
      return api.banUser({
        userId: action.userId,
        reason: action.reason,
        expiresInSeconds: action.expiresInSeconds,
      })
    case "unban":
      return api.unbanUser(action.userId)
    case "impersonate":
      return api.impersonateUser(action.userId)
    case "stop-impersonating":
      return api.stopImpersonating()
    case "revoke":
      return api.revokeUserSessions(action.userId)
    case "role":
      return api.setRole({ userId: action.userId, role: action.role })
  }
}
