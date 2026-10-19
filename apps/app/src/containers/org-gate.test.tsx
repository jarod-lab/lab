// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { OrgGate } from "./org-gate"

const babbage = { id: "org-b", name: "Babbage Labs", slug: "babbage" }

describe("OrgGate", () => {
  it("renders its children when the session's active org is this one", async () => {
    const auth = fakeAuth()
    renderWithClient(
      <OrgGate
        auth={auth}
        organization={{ id: "org-a", name: "Analytical Ltd", slug: "analytical" }}
      >
        <p>Org content</p>
      </OrgGate>,
    )
    expect(await screen.findByText("Org content")).toBeTruthy()
    expect(auth.setActiveOrganization).not.toHaveBeenCalled()
  })

  it("sets the org active, with its id, before showing anything org-scoped", async () => {
    const auth = fakeAuth({
      getSession: vi
        .fn()
        .mockResolvedValueOnce({
          user: { id: "u", email: "a@example.com", name: "A" },
          activeOrganizationId: "org-a",
        })
        .mockResolvedValue({
          user: { id: "u", email: "a@example.com", name: "A" },
          activeOrganizationId: "org-b",
        }),
    })
    renderWithClient(
      <OrgGate auth={auth} organization={babbage}>
        <p>Org content</p>
      </OrgGate>,
    )
    await waitFor(() => expect(auth.setActiveOrganization).toHaveBeenCalledWith("org-b"))
    expect(await screen.findByText("Org content")).toBeTruthy()
  })

  it("shows a retry instead of looping when the switch is refused", async () => {
    const auth = fakeAuth({
      getSession: vi.fn(async () => ({
        user: { id: "u", email: "a@example.com", name: "A" },
        activeOrganizationId: "org-a",
      })),
      setActiveOrganization: vi.fn(async () => {
        throw new Error("nope")
      }),
    })
    renderWithClient(
      <OrgGate auth={auth} organization={babbage}>
        <p>Org content</p>
      </OrgGate>,
    )
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("Could not switch to Babbage Labs.")
    expect(screen.queryByText("Org content")).toBeNull()
    expect(auth.setActiveOrganization).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(auth.setActiveOrganization).toHaveBeenCalledTimes(2))
  })

  it("offers sign-in again when the session has ended", async () => {
    const auth = fakeAuth({ getSession: vi.fn(async () => null) })
    renderWithClient(
      <OrgGate auth={auth} organization={babbage} signInHref="/sign-in?next=%2Fbabbage">
        <p>Org content</p>
      </OrgGate>,
    )
    const link = await screen.findByRole("link", { name: "Sign in again" })
    expect(link.getAttribute("href")).toBe("/sign-in?next=%2Fbabbage")
    expect(screen.queryByText("Org content")).toBeNull()
    expect(auth.setActiveOrganization).not.toHaveBeenCalled()
  })
  it("shows a retry when the session cannot be loaded", async () => {
    const auth = fakeAuth({ getSession: vi.fn(async () => Promise.reject(new Error("offline"))) })
    renderWithClient(
      <OrgGate auth={auth} organization={babbage}>
        <p>Org content</p>
      </OrgGate>,
    )
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
  it("does not call set-active while impersonating, and shows a notice instead", async () => {
    const auth = fakeAuth({
      getSession: vi.fn(async () => ({
        user: { id: "u", email: "a@example.com", name: "A" },
        activeOrganizationId: "org-a",
        impersonatedBy: "admin-1",
      })),
    })
    renderWithClient(
      <OrgGate auth={auth} organization={babbage}>
        <p>Org content</p>
      </OrgGate>,
    )
    expect(
      await screen.findByText(
        "You can't switch organizations while impersonating. Stop impersonating to continue.",
      ),
    ).toBeTruthy()
    expect(screen.queryByText("Org content")).toBeNull()
    expect(auth.setActiveOrganization).not.toHaveBeenCalled()
  })
})
