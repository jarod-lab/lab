// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ReauthProvider } from "../components/reauth-dialog"
import { AccountError, type AccountApi, SessionNotFreshError } from "../lib/account-api"
import { renderWithClient } from "../test/render"
import { renderWithReauth } from "../test/reauth"
import { PASSWORD_ONLY_METHODS } from "../lib/web-auth"
import type { ReauthAuth } from "../lib/reauth"
import { AccountSecurityContainer } from "./account-security"

// The server offers both social providers; the connect row for Google comes from that list.
vi.mock("../lib/web-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/web-auth")>()),
  getWebAuth: () => ({
    signInMethods: async () => ({
      ...PASSWORD_ONLY_METHODS,
      social: ["github", "google"],
    }),
  }),
}))

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
    renderWithClient(<AccountSecurityContainer api={fakeAccountApi()} />)
    expect(await screen.findByText(/^Passkey · .* · Chrome on macOS$/)).toBeTruthy()
    expect(screen.getByText(/^Connected · Sep [12], 2026$/)).toBeTruthy()
    expect(screen.getByText("Signed in with Google · 2 days ago")).toBeTruthy()
    expect(screen.getByText("This device")).toBeTruthy()
  })

  it("offers a sign-in button when the sessions list is refused as not fresh, and keeps the rest", async () => {
    const api = fakeAccountApi({
      listSessions: vi.fn(async () => {
        throw new AccountError("Session is not fresh", 403, "SESSION_NOT_FRESH")
      }),
    })
    renderWithClient(<AccountSecurityContainer api={api} />)
    expect(await screen.findByRole("button", { name: "Sign in again" })).toBeTruthy()
    expect(screen.getByText("1 passkey")).toBeTruthy()
  })

  it("passes a sign-out of another session to the server, then reloads the list", async () => {
    const user = userEvent.setup()
    const api = fakeAccountApi()
    renderWithClient(<AccountSecurityContainer api={api} />)
    await user.click(await screen.findByRole("button", { name: "Sign out Safari on iPhone" }))
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith("t-2"))
  })

  it("starts a connect by sending the person to the provider's sign-in", async () => {
    const user = userEvent.setup()
    const linkSocial = vi.fn(async () => undefined)
    renderWithClient(<AccountSecurityContainer api={fakeAccountApi({ linkSocial })} />)
    const google = await screen.findByText("Not connected")
    const row = google.closest("div")?.parentElement as HTMLElement
    await user.click(within(row).getByRole("button", { name: "Connect" }))
    expect(linkSocial).toHaveBeenCalledWith("google", "/account/security")
  })

  it("asks the person to confirm it's them when a sign-out is refused as not fresh, then signs that session out", async () => {
    const user = userEvent.setup()
    const revokeSession = vi
      .fn<(token: string) => Promise<void>>()
      .mockRejectedValueOnce(new SessionNotFreshError(403))
      .mockResolvedValueOnce(undefined)
    const api = fakeAccountApi({ revokeSession })
    // A re-sign-in replaces the session: the token changes, the person stays the same.
    let token = "t-now"
    const auth: ReauthAuth = {
      session: vi.fn(async () => ({ userId: "user-1", token, activeOrganizationId: null })),
      signInWithPassword: vi.fn(async () => {
        token = "t-new"
        return "done" as const
      }),
      signInWithPasskey: vi.fn(async () => undefined),
      verifyCode: vi.fn(async () => undefined),
      verifyBackupCode: vi.fn(async () => undefined),
      signOut: vi.fn(async () => undefined),
      setActiveOrganization: vi.fn(async () => undefined),
      revokeSession: vi.fn(async () => undefined),
    }
    renderWithClient(
      <ReauthProvider auth={auth} api={api} reload={vi.fn()}>
        <AccountSecurityContainer api={api} />
      </ReauthProvider>,
    )
    await user.click(await screen.findByRole("button", { name: "Sign out Safari on iPhone" }))
    const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
    await user.type(within(dialog).getByLabelText("Password"), "correct horse")
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(revokeSession).toHaveBeenCalledTimes(2))
    expect(revokeSession.mock.calls).toEqual([["t-2"], ["t-2"]])
    expect(auth.signInWithPassword).toHaveBeenCalledWith("ada@example.com", "correct horse")
  })

  it("offers a sign-in button where the sessions list needs a recent sign-in, and reloads the list once it is confirmed", async () => {
    const user = userEvent.setup()
    const listSessions = fakeAccountApi().listSessions
    const api = fakeAccountApi({
      listSessions: vi
        .fn()
        .mockRejectedValueOnce(new SessionNotFreshError(403))
        .mockImplementation(listSessions),
    })
    const { reauth } = renderWithReauth(<AccountSecurityContainer api={api} />)
    await user.click(await screen.findByRole("button", { name: "Sign in again" }))
    const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
    await user.type(within(dialog).getByLabelText("Password"), "pw")
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole("button", { name: "Sign out Safari on iPhone" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Sign in again" })).toBeNull()
    expect(reauth.signInWithPassword).toHaveBeenCalledTimes(1)
  })

  describe("AccountSecurityContainer when the session is not fresh", () => {
    async function openNewCodes(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole("button", { name: "Make new codes" }))
      const codes = await screen.findByRole("dialog", { name: "Make new backup codes" })
      await user.type(within(codes).getByLabelText("Password"), "correct horse")
      await user.click(within(codes).getByRole("button", { name: "Make new codes" }))
      return codes
    }

    it("asks the person to confirm it's them when new backup codes are refused, then makes them once more", async () => {
      const user = userEvent.setup()
      const api = fakeAccountApi({
        newBackupCodes: vi
          .fn<(password: string) => Promise<string[]>>()
          .mockRejectedValueOnce(new SessionNotFreshError(403))
          .mockResolvedValueOnce(["aaaa-1111"]),
      })
      const { reauth } = renderWithReauth(<AccountSecurityContainer api={api} />)
      await openNewCodes(user)
      const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
      await user.type(within(dialog).getByLabelText("Password"), "pw")
      await user.click(within(dialog).getByRole("button", { name: "Confirm" }))

      expect(await screen.findByRole("heading", { name: "Your new backup codes" })).toBeTruthy()
      expect(api.newBackupCodes).toHaveBeenCalledTimes(2)
      expect(api.newBackupCodes).toHaveBeenLastCalledWith("correct horse")
      expect(reauth.signInWithPassword).toHaveBeenCalledTimes(1)
    })

    it("cancelled: shows the refusal and makes no new codes", async () => {
      const user = userEvent.setup()
      const api = fakeAccountApi({
        newBackupCodes: vi.fn(async () => {
          throw new SessionNotFreshError(403)
        }),
      })
      renderWithReauth(<AccountSecurityContainer api={api} />)
      const codes = await openNewCodes(user)
      const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }))

      expect(
        await within(codes).findByText(
          "Sign in again to continue. Changes like this need a recent sign-in.",
        ),
      ).toBeTruthy()
      expect(api.newBackupCodes).toHaveBeenCalledTimes(1)
    })

    it("asks the person to confirm it's them when a connect is refused, then connects once more", async () => {
      const user = userEvent.setup()
      const linkSocial = vi
        .fn<(provider: string, callbackURL: string) => Promise<string | undefined>>()
        .mockRejectedValueOnce(new SessionNotFreshError(403))
        .mockResolvedValueOnce(undefined)
      renderWithReauth(<AccountSecurityContainer api={fakeAccountApi({ linkSocial })} />)
      const google = await screen.findByText("Not connected")
      const row = google.closest("div")?.parentElement as HTMLElement
      await user.click(within(row).getByRole("button", { name: "Connect" }))
      const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
      await user.type(within(dialog).getByLabelText("Password"), "pw")
      await user.click(within(dialog).getByRole("button", { name: "Confirm" }))

      await waitFor(() => expect(linkSocial).toHaveBeenCalledTimes(2))
      expect(linkSocial).toHaveBeenLastCalledWith("google", "/account/security")
    })

    it("cancelled connect: shows the refusal and does not start the provider sign-in again", async () => {
      const user = userEvent.setup()
      const linkSocial = vi.fn(async () => {
        throw new SessionNotFreshError(403)
      })
      renderWithReauth(<AccountSecurityContainer api={fakeAccountApi({ linkSocial })} />)
      const google = await screen.findByText("Not connected")
      const row = google.closest("div")?.parentElement as HTMLElement
      await user.click(within(row).getByRole("button", { name: "Connect" }))
      const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }))

      expect(
        await screen.findByText(
          "Sign in again to continue. Changes like this need a recent sign-in.",
        ),
      ).toBeTruthy()
      expect(linkSocial).toHaveBeenCalledTimes(1)
    })
  })
})
