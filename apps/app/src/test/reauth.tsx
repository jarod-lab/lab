import type { ReactElement } from "react"
import { vi } from "vitest"

import { type ReauthMethodSource, ReauthProvider } from "../components/reauth-dialog"
import { SessionNotFreshError } from "../lib/account-api"
import type { ReauthAuth, ReauthSession } from "../lib/reauth"
import { renderWithClient } from "./render"

/**
 * A reauth client whose session changes when a password sign-in succeeds, as the browser's does: a
 * new token for the same person, and the first organization as the active one.
 */
export function fakeReauthAuth(overrides: Partial<ReauthAuth> = {}): ReauthAuth {
  let token = "t-old"
  let activeOrganizationId: string | null = "org-a"
  const signedIn = () => {
    token = "t-new"
    activeOrganizationId = "org-a"
  }
  return {
    session: vi.fn(
      async (): Promise<ReauthSession> => ({ userId: "user-1", token, activeOrganizationId }),
    ),
    signInWithPassword: vi.fn(async () => {
      signedIn()
      return "done" as const
    }),
    signInWithPasskey: vi.fn(async () => signedIn()),
    verifyCode: vi.fn(async () => signedIn()),
    verifyBackupCode: vi.fn(async () => signedIn()),
    signOut: vi.fn(async () => undefined),
    setActiveOrganization: vi.fn(async (organizationId: string) => {
      activeOrganizationId = organizationId
    }),
    revokeSession: vi.fn(async () => undefined),
    ...overrides,
  }
}

/** The account lists the dialog reads to offer the password (ada@example.com has one, no passkey). */
export const reauthMethodSource: ReauthMethodSource = {
  getProfile: async () => ({
    id: "user-1",
    name: "Ada",
    email: "ada@example.com",
    emailVerified: true,
    currentSessionToken: "t-old",
  }),
  listAccounts: async () => [{ id: "acc-1", providerId: "credential", createdAt: null }],
  listPasskeys: async () => [],
}

/**
 * Renders `ui` under a ReauthProvider with the fakes above. The test drives the dialog itself, with
 * the password "pw": the person re-signs in, and the refused action is retried once.
 */
export function renderWithReauth(ui: ReactElement, auth: ReauthAuth = fakeReauthAuth()) {
  return {
    reauth: auth,
    ...renderWithClient(
      <ReauthProvider auth={auth} api={reauthMethodSource} reload={vi.fn()}>
        {ui}
      </ReauthProvider>,
    ),
  }
}

/** The refusal the server gives a call made on a session older than the fresh window. */
export function notFresh(): SessionNotFreshError {
  return new SessionNotFreshError(403)
}
