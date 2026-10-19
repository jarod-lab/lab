// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { AccountApi } from "../lib/account-api"
import type { OrgSettingsApi } from "../lib/org-settings-api"
import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { fakeReauthAuth, notFresh, renderWithReauth } from "../test/reauth"
import { AccountProfileContainer } from "./account-profile"

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
    listAccounts: vi.fn(async () => []),
    linkSocial: vi.fn(async () => undefined),
    unlinkAccount: vi.fn(async () => undefined),
    listPasskeys: vi.fn(async () => []),
    addPasskey: vi.fn(async () => undefined),
    renamePasskey: vi.fn(async () => undefined),
    deletePasskey: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => []),
    revokeSession: vi.fn(async () => undefined),
    revokeOtherSessions: vi.fn(async () => undefined),
    securitySummary: vi.fn(async () => ({
      passwordChangedAt: null,
      twoFactorEnabled: false,
      twoFactorEnabledAt: null,
      backupCodesRemaining: null,
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

const orgApi = { leaveOrganization: vi.fn(async () => undefined) } as unknown as Pick<
  OrgSettingsApi,
  "leaveOrganization"
>

describe("AccountProfileContainer", () => {
  it("names the organizations the person owns as blocking deletion, using the roles the shell reads", async () => {
    const auth = fakeAuth({
      memberRole: vi.fn(async (organizationId: string) =>
        organizationId === "org-a" ? "owner" : "member",
      ),
    })
    renderWithClient(<AccountProfileContainer auth={auth} api={fakeAccountApi()} orgApi={orgApi} />)
    expect(await screen.findByRole("button", { name: "Delete my account" })).toHaveProperty(
      "disabled",
      true,
    )
    expect(screen.getByText("You own Analytical Ltd.")).toBeTruthy()
    // Babbage Labs is a member role: it is the one that can be left.
    expect(screen.getByRole("button", { name: "Leave" })).toBeTruthy()
  })

  it("keeps the pending change on the page after it is requested, and lets the person cancel it", async () => {
    const user = userEvent.setup()
    const api = fakeAccountApi()
    const auth = fakeAuth({ memberRole: vi.fn(async () => "member") })
    renderWithClient(<AccountProfileContainer auth={auth} api={api} orgApi={orgApi} />)
    await user.click(await screen.findByRole("button", { name: "Change email" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText("New email"), "ada@northwind.io")
    await user.click(within(dialog).getByRole("button", { name: "Send confirmation link" }))
    await waitFor(() =>
      expect(api.changeEmail).toHaveBeenCalledWith("ada@northwind.io", "/account/profile"),
    )
    const status = await screen.findByRole("status")
    expect(within(status).getByText("ada@northwind.io")).toBeTruthy()
    await user.click(within(status).getByRole("button", { name: "Resend" }))
    expect(api.changeEmail).toHaveBeenCalledTimes(2)
    await user.click(within(status).getByRole("button", { name: "Cancel change" }))
    expect(screen.queryByRole("status")).toBeNull()
  })

  it("maps a server refusal to deletion into a message, and confirms the request when it is sent", async () => {
    const user = userEvent.setup()
    const api = fakeAccountApi({
      requestAccountDeletion: vi.fn(async () => {
        throw new Error("You own Acme. Transfer or delete it first.")
      }),
    })
    const auth = fakeAuth({ memberRole: vi.fn(async () => "member") })
    renderWithClient(<AccountProfileContainer auth={auth} api={api} orgApi={orgApi} />)
    await user.click(await screen.findByRole("button", { name: "Delete my account" }))
    const confirm = await screen.findByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: "Email me the link" }))
    expect(
      await within(confirm).findByText("You own Acme. Transfer or delete it first."),
    ).toBeTruthy()
    expect(api.requestAccountDeletion).toHaveBeenCalledWith("/account/profile")
  })

  it("asks the person to confirm it's them when a change is refused as not fresh, then retries it once", async () => {
    const user = userEvent.setup()
    const api = fakeAccountApi({
      changeEmail: vi.fn().mockRejectedValueOnce(notFresh()).mockResolvedValueOnce(undefined),
    })
    const auth = fakeReauthAuth()
    const webAuth = fakeAuth({ memberRole: vi.fn(async () => "member") })
    renderWithReauth(<AccountProfileContainer auth={webAuth} api={api} orgApi={orgApi} />, auth)
    await user.click(await screen.findByRole("button", { name: "Change email" }))
    const form = await screen.findByRole("dialog")
    await user.type(within(form).getByLabelText("New email"), "ada@northwind.io")
    await user.click(within(form).getByRole("button", { name: "Send confirmation link" }))
    const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
    await user.type(within(dialog).getByLabelText("Password"), "pw")
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(api.changeEmail).toHaveBeenCalledTimes(2))
    expect(api.changeEmail).toHaveBeenNthCalledWith(2, "ada@northwind.io", "/account/profile")
    expect(auth.signInWithPassword).toHaveBeenCalledWith("ada@example.com", "pw")
  })

  it("does not retry a refused deletion when the person cancels the confirm", async () => {
    const user = userEvent.setup()
    const api = fakeAccountApi({
      requestAccountDeletion: vi.fn().mockRejectedValue(notFresh()),
    })
    const auth = fakeReauthAuth()
    const webAuth = fakeAuth({ memberRole: vi.fn(async () => "member") })
    renderWithReauth(<AccountProfileContainer auth={webAuth} api={api} orgApi={orgApi} />, auth)
    await user.click(await screen.findByRole("button", { name: "Delete my account" }))
    const confirm = await screen.findByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: "Email me the link" }))
    const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Confirm it's you" })).toBeNull(),
    )
    expect(api.requestAccountDeletion).toHaveBeenCalledTimes(1)
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })
})
