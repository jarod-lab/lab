// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { AdminApi, AdminSession, AdminUser } from "../lib/admin-api"
import { WebError } from "../lib/web-auth"
import { fakeAdminApi } from "../test/fake-admin"
import { notFresh, renderWithReauth } from "../test/reauth"
import { AdminContainer } from "./admin"
import { ImpersonationBanner } from "./impersonation-banner"

const admin: AdminSession = {
  userId: "me",
  name: "Ada Admin",
  email: "ada@acme.dev",
  role: "admin",
  impersonatedBy: null,
}

const grace: AdminUser = {
  id: "u2",
  name: "Grace Hopper",
  email: "grace@acme.dev",
  emailVerified: true,
  role: "user",
  banned: false,
  banReason: null,
  banExpires: null,
  createdAt: "2026-10-01T00:00:00.000Z",
}

const fakeApi = (overrides: Partial<AdminApi> = {}, session: AdminSession | null = admin) =>
  fakeAdminApi(
    { listUsers: vi.fn(async () => ({ users: [grace], total: 1 })), ...overrides },
    session,
  )

const renderAdmin = (api: AdminApi, onNavigate = vi.fn()) =>
  renderWithReauth(
    <AdminContainer
      api={api}
      tabs={[{ id: "users", label: "Users", href: "/admin/users" }]}
      onNavigate={onNavigate}
      renderLink={({ href, children, ...rest }) => (
        <a href={href} {...rest}>
          {children}
        </a>
      )}
    />,
  )

describe("AdminContainer across a change of identity", () => {
  // The router can keep /admin rendered while the next page loads, so the container may still be
  // mounted when the session changes under it. It must follow the new session, not keep the old one.
  it("shows the admin page after Stop, even if it stayed mounted through the impersonation", async () => {
    let session: AdminSession = { ...admin, role: "user", impersonatedBy: "me" }
    const api = fakeApi({
      getSession: vi.fn(async () => session),
      stopImpersonating: vi.fn(async () => {
        session = admin
      }),
    })
    const user = userEvent.setup()
    renderWithReauth(
      <>
        <ImpersonationBanner api={api} onNavigate={vi.fn()} />
        <AdminContainer
          api={api}
          tabs={[{ id: "users", label: "Users", href: "/admin/users" }]}
          onNavigate={vi.fn()}
          renderLink={({ href, children, ...rest }) => (
            <a href={href} {...rest}>
              {children}
            </a>
          )}
        />
      </>,
    )
    expect(await screen.findByRole("heading", { name: "Not available" })).toBeTruthy()

    await user.click(await screen.findByRole("button", { name: "Stop" }))
    expect(await screen.findByRole("heading", { name: "Admin" })).toBeTruthy()
    expect(await screen.findByRole("row", { name: /Grace Hopper/ })).toBeTruthy()
  })
})

describe("AdminContainer", () => {
  it("lists users for a platform admin, sorted newest first by the server", async () => {
    const api = fakeApi()
    renderAdmin(api)
    expect(await screen.findByRole("row", { name: /Grace Hopper/ })).toBeTruthy()
    expect(api.listUsers).toHaveBeenCalledWith({ search: "", offset: 0, limit: 50 })
  })

  it("says Not available to a user who is not an admin, and never lists", async () => {
    const api = fakeApi({}, { ...admin, role: "user" })
    renderAdmin(api)
    expect(await screen.findByRole("heading", { name: "Not available" })).toBeTruthy()
    expect(api.listUsers).not.toHaveBeenCalled()
  })

  it("says Not available while an admin is impersonating (the session is the target's)", async () => {
    const api = fakeApi({}, { ...admin, role: "user", impersonatedBy: "me" })
    renderAdmin(api)
    expect(await screen.findByRole("heading", { name: "Not available" })).toBeTruthy()
  })

  it("says Not available when signed out", async () => {
    renderAdmin(fakeApi({}, null))
    expect(await screen.findByRole("heading", { name: "Not available" })).toBeTruthy()
  })

  it("says Not available when the list is refused with 403 (the role changed under the page)", async () => {
    const api = fakeApi({
      listUsers: vi.fn(async () => {
        throw new WebError("You are not allowed", 403, "YOU_ARE_NOT_ALLOWED_TO_LIST_USERS")
      }),
    })
    renderAdmin(api)
    expect(await screen.findByRole("heading", { name: "Not available" })).toBeTruthy()
  })

  it("shows other list errors on the page", async () => {
    const api = fakeApi({
      listUsers: vi.fn(async () => {
        throw new WebError("Could not load users", 500)
      }),
    })
    renderAdmin(api)
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Could not load users")
  })

  it("searches by email after a pause, and goes back to the first page", async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderAdmin(api)
    await screen.findByRole("row", { name: /Grace Hopper/ })
    await user.type(screen.getByLabelText("Search by email"), "grace")
    await waitFor(() =>
      expect(api.listUsers).toHaveBeenLastCalledWith({ search: "grace", offset: 0, limit: 50 }),
    )
  })

  it("impersonating clears the cache and navigates into the app", async () => {
    const api = fakeApi()
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    renderAdmin(api, onNavigate)
    await screen.findByRole("row", { name: /Grace Hopper/ })
    await user.click(screen.getByRole("button", { name: "Actions for Grace Hopper" }))
    await user.click(await screen.findByRole("menuitem", { name: "Impersonate" }))
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Impersonate" }),
    )
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/"))
    expect(api.impersonateUser).toHaveBeenCalledWith("u2")
  })

  it("a ban refreshes the list", async () => {
    const api = fakeApi()
    const user = userEvent.setup()
    renderAdmin(api)
    await screen.findByRole("row", { name: /Grace Hopper/ })
    const listCalls = vi.mocked(api.listUsers).mock.calls.length
    await user.click(screen.getByRole("button", { name: "Actions for Grace Hopper" }))
    await user.click(await screen.findByRole("menuitem", { name: "Ban" }))
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Ban user" }),
    )
    await waitFor(() => expect(api.banUser).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(vi.mocked(api.listUsers).mock.calls.length).toBeGreaterThan(listCalls),
    )
  })

  it("asks the person to confirm it's them when an impersonation is refused as not fresh, then impersonates once", async () => {
    const api = fakeApi({
      impersonateUser: vi.fn().mockRejectedValueOnce(notFresh()).mockResolvedValueOnce(undefined),
    })
    const onNavigate = vi.fn()
    const user = userEvent.setup()
    const { reauth } = renderAdmin(api, onNavigate)
    await screen.findByRole("row", { name: /Grace Hopper/ })
    await user.click(screen.getByRole("button", { name: "Actions for Grace Hopper" }))
    await user.click(await screen.findByRole("menuitem", { name: "Impersonate" }))
    await user.click(
      within(await screen.findByRole("dialog", { name: /Impersonate/ })).getByRole("button", {
        name: "Impersonate",
      }),
    )
    const confirm = await screen.findByRole("dialog", { name: "Confirm it's you" })
    await user.type(within(confirm).getByLabelText("Password"), "pw")
    await user.click(within(confirm).getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/"))
    expect(api.impersonateUser).toHaveBeenCalledTimes(2)
    expect(reauth.signInWithPassword).toHaveBeenCalledTimes(1)
  })
})
