// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AccountError, type AccountApi } from "../lib/account-api"
import { renderWithClient } from "../test/render"
import { PASSWORD_ONLY_METHODS, type WebAuth } from "../lib/web-auth"
import { AccountSecurityContainer } from "./account-security"

// The server offers both social providers; the connect row for Google comes from that list.
const auth: Pick<WebAuth, "signInMethods"> = {
  signInMethods: async () => ({ ...PASSWORD_ONLY_METHODS, social: ["github", "google"] }),
}

function fakeAccountApi(overrides: Partial<AccountApi> = {}): AccountApi {
  return {
    getProfile: vi.fn(async () => ({
      id: "user-1",
      name: "Ada",
      email: "ada@example.com",
      emailVerified: true,
      currentSessionToken: "t-now",
    })),
    updateName: vi.fn(async () => undefined),
    changeEmail: vi.fn(async () => undefined),
    requestAccountDeletion: vi.fn(async () => undefined),
    listAccounts: vi.fn(async () => [
      { id: "cred-1", providerId: "credential", createdAt: "2026-06-01T00:00:00Z" },
      { id: "acc-gh", providerId: "github", createdAt: "2026-09-02T00:00:00Z" },
    ]),
    linkSocial: vi.fn(async () => undefined),
    unlinkAccount: vi.fn(async () => undefined),
    listPasskeys: vi.fn(async () => [{ id: "pk-1", name: "Laptop", createdAt: null }]),
    addPasskey: vi.fn(async () => undefined),
    renamePasskey: vi.fn(async () => undefined),
    deletePasskey: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => [
      {
        token: "t-now",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/126.0 Safari/537.36",
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        loginMethod: "passkey",
        loginTwoFactor: false,
        current: true,
      },
      {
        token: "t-2",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604.1",
        createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        loginMethod: "google",
        loginTwoFactor: false,
        current: false,
      },
    ]),
    revokeSession: vi.fn(async () => undefined),
    revokeOtherSessions: vi.fn(async () => undefined),
    securitySummary: vi.fn(async () => ({
      passwordChangedAt: "2026-07-01T00:00:00Z",
      twoFactorEnabled: true,
      twoFactorEnabledAt: "2026-09-02T00:00:00Z",
      backupCodesRemaining: 8,
    })),
    enableTwoFactor: vi.fn(async () => ({ totpURI: "", backupCodes: [] })),
    confirmTwoFactor: vi.fn(async () => undefined),
    disableTwoFactor: vi.fn(async () => undefined),
    newBackupCodes: vi.fn(async () => []),
    changePassword: vi.fn(async () => undefined),
    completeSignInWithCode: vi.fn(async () => undefined),
    completeSignInWithBackupCode: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe("AccountSecurityContainer", () => {
  it("reads the page from the account calls: connected accounts, the sign-in, and the sessions", async () => {
    renderWithClient(<AccountSecurityContainer auth={auth} api={fakeAccountApi()} />)
    expect(await screen.findByText(/^Passkey · .* · Chrome on macOS$/)).toBeTruthy()
    expect(screen.getByText(/^Connected · Sep [12], 2026$/)).toBeTruthy()
    expect(screen.getByText("Signed in with Google · 2 days ago")).toBeTruthy()
    expect(screen.getByText("This device")).toBeTruthy()
  })

  it("tells the person to sign in again when the sessions list is refused as not fresh, and keeps the rest", async () => {
    const api = fakeAccountApi({
      listSessions: vi.fn(async () => {
        throw new AccountError("Session is not fresh", 403, "SESSION_NOT_FRESH")
      }),
    })
    renderWithClient(<AccountSecurityContainer auth={auth} api={api} />)
    expect(await screen.findByRole("link", { name: "Sign in again" })).toBeTruthy()
    expect(screen.getByText("1 passkey")).toBeTruthy()
  })

  it("passes a sign-out of another session to the server, then reloads the list", async () => {
    const user = userEvent.setup()
    const api = fakeAccountApi()
    renderWithClient(<AccountSecurityContainer auth={auth} api={api} />)
    await user.click(await screen.findByRole("button", { name: "Sign out Safari on iPhone" }))
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith("t-2"))
  })

  it("starts a connect by sending the person to the provider's sign-in", async () => {
    const user = userEvent.setup()
    const linkSocial = vi.fn(async () => undefined)
    renderWithClient(<AccountSecurityContainer auth={auth} api={fakeAccountApi({ linkSocial })} />)
    const google = await screen.findByText("Not connected")
    const row = google.closest("div")?.parentElement as HTMLElement
    await user.click(within(row).getByRole("button", { name: "Connect" }))
    expect(linkSocial).toHaveBeenCalledWith("google", "/account/security")
  })
})
