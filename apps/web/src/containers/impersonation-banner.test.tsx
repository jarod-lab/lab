// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AdminApi, AdminSession } from "../lib/admin-api"
import { renderWithClient } from "../test/render"
import { ImpersonationBanner } from "./impersonation-banner"

const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ navigate }) }))

const acting: AdminSession = {
  userId: "u2",
  name: "Grace Hopper",
  email: "grace@acme.dev",
  role: "user",
  impersonatedBy: "me",
}

function fakeApi(session: AdminSession | null): AdminApi {
  return {
    getSession: vi.fn(async () => session),
    listUsers: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    impersonateUser: vi.fn(),
    stopImpersonating: vi.fn(async () => {}),
    revokeUserSessions: vi.fn(),
    setRole: vi.fn(),
  } as unknown as AdminApi
}

beforeEach(() => navigate.mockClear())

describe("ImpersonationBanner", () => {
  it("names the person being impersonated, with Stop", async () => {
    renderWithClient(<ImpersonationBanner api={fakeApi(acting)} />)
    expect(await screen.findByRole("status", { name: "Impersonation" })).toBeTruthy()
    expect(screen.getByText(/You are impersonating Grace Hopper/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy()
  })

  it("renders nothing for an ordinary session", async () => {
    const api = fakeApi({ ...acting, impersonatedBy: null })
    renderWithClient(<ImpersonationBanner api={api} />)
    await waitFor(() => expect(api.getSession).toHaveBeenCalled())
    expect(screen.queryByRole("status", { name: "Impersonation" })).toBeNull()
  })

  it("renders nothing while signed out", async () => {
    const api = fakeApi(null)
    renderWithClient(<ImpersonationBanner api={api} />)
    await waitFor(() => expect(api.getSession).toHaveBeenCalled())
    expect(screen.queryByRole("status", { name: "Impersonation" })).toBeNull()
  })

  it("Stop ends impersonation and returns to /admin", async () => {
    const api = fakeApi(acting)
    const user = userEvent.setup()
    renderWithClient(<ImpersonationBanner api={api} />)
    await user.click(await screen.findByRole("button", { name: "Stop" }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ href: "/admin" }))
    expect(api.stopImpersonating).toHaveBeenCalledTimes(1)
  })
})
