import { vi } from "vitest"

import type { AdminApi, AdminSession } from "../lib/admin-api"

/** A signed-in person as the admin API reads the session; `role` "admin" is a platform admin. */
export function adminSessionFixture(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    userId: "user-1",
    name: "Ada",
    email: "ada@example.com",
    role: "user",
    impersonatedBy: null,
    ...overrides,
  }
}

/** Every call succeeds with nothing to show; tests override what they look at. */
export function fakeAdminApi(
  overrides: Partial<AdminApi> = {},
  session: AdminSession | null = adminSessionFixture(),
): AdminApi {
  return {
    getSession: vi.fn(async () => session),
    listUsers: vi.fn(async () => ({ users: [], total: 0 })),
    banUser: vi.fn(async () => {}),
    unbanUser: vi.fn(async () => {}),
    impersonateUser: vi.fn(async () => {}),
    stopImpersonating: vi.fn(async () => {}),
    revokeUserSessions: vi.fn(async () => {}),
    setRole: vi.fn(async () => {}),
    ...overrides,
  }
}
