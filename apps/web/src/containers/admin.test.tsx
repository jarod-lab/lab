// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { AdminApi, AdminSession, AdminUser } from "../lib/admin-api"
import { WebError } from "../lib/web-auth"
import { renderWithClient } from "../test/render"
import { AdminContainer } from "./admin"

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

function fakeApi(
  overrides: Partial<AdminApi> = {},
  session: AdminSession | null = admin,
): AdminApi {
  return {
    getSession: vi.fn(async () => session),
    listUsers: vi.fn(async () => ({ users: [grace], total: 1 })),
    banUser: vi.fn(async () => {}),
    unbanUser: vi.fn(async () => {}),
    impersonateUser: vi.fn(async () => {}),
    stopImpersonating: vi.fn(async () => {}),
    revokeUserSessions: vi.fn(async () => {}),
    setRole: vi.fn(async () => {}),
    ...overrides,
  }
}

const renderAdmin = (api: AdminApi, onNavigate = vi.fn()) =>
  renderWithClient(
    <AdminContainer
      api={api}
      onNavigate={onNavigate}
      renderLink={({ href, children, ...rest }) => (
        <a href={href} {...rest}>
          {children}
        </a>
      )}
    />,
  )

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
})
