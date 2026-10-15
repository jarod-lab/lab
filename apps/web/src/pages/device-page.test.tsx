// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fakeAuth } from "../test/fake-auth"
import { DevicePage } from "./device-page"

describe("DevicePage", () => {
  it("offers sign-in first when there is no session", async () => {
    render(<DevicePage auth={fakeAuth({ getSession: vi.fn(async () => null) })} />)
    expect(await screen.findByRole("heading", { name: "Sign in to approve" })).toBeTruthy()
  })

  it("has no accessibility violations on the code entry step", async () => {
    const { container } = render(<DevicePage auth={fakeAuth()} initialUserCode="ABCD-1234" />)
    await screen.findByRole("button", { name: "Find request" })
    await expectNoA11yViolations(container.innerHTML)
  })

  it("prefills the code and shows the request to approve", async () => {
    const auth = fakeAuth()
    const { container } = render(<DevicePage auth={auth} initialUserCode="ABCD-1234" />)
    await screen.findByRole("button", { name: "Find request" })
    expect(await screen.findByLabelText("Code")).toHaveProperty("value", "ABCD-1234")

    await userEvent.setup().click(screen.getByRole("button", { name: "Find request" }))
    expect(
      await screen.findByRole("heading", { name: "Claude Code wants to act for you" }),
    ).toBeTruthy()
    expect(screen.getByText("Read data in the organization")).toBeTruthy()
    expect(auth.device.lookup).toHaveBeenCalledWith("ABCD-1234")
    await expectNoA11yViolations(container.innerHTML)
  })

  it("sets the organization active before approving", async () => {
    const auth = fakeAuth()
    render(<DevicePage auth={auth} initialUserCode="ABCD-1234" />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Find request" }))
    await user.selectOptions(await screen.findByRole("combobox", { name: "Organization" }), "org-b")
    await user.click(screen.getByRole("button", { name: "Approve" }))

    expect(await screen.findByRole("heading", { name: "Approved" })).toBeTruthy()
    expect(auth.setActiveOrganization).toHaveBeenCalledWith("org-b")
    expect(auth.device.approve).toHaveBeenCalledWith("ABCD-1234")
    const setActive = vi.mocked(auth.setActiveOrganization).mock.invocationCallOrder[0] ?? 0
    const approve = vi.mocked(auth.device.approve).mock.invocationCallOrder[0] ?? 0
    expect(setActive).toBeLessThan(approve)
  })

  it("denies the request without changing the organization", async () => {
    const auth = fakeAuth()
    render(<DevicePage auth={auth} initialUserCode="ABCD-1234" />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Find request" }))
    await user.click(await screen.findByRole("button", { name: "Deny" }))

    expect(await screen.findByRole("heading", { name: "Denied" })).toBeTruthy()
    expect(auth.device.deny).toHaveBeenCalledWith("ABCD-1234")
    expect(auth.setActiveOrganization).not.toHaveBeenCalled()
  })

  it("explains a code that is not waiting for approval", async () => {
    const auth = fakeAuth({
      device: {
        lookup: vi.fn(async () => ({ status: "approved" })),
        approve: vi.fn(async () => undefined),
        deny: vi.fn(async () => undefined),
      },
    })
    render(<DevicePage auth={auth} initialUserCode="ABCD-1234" />)
    await userEvent.setup().click(await screen.findByRole("button", { name: "Find request" }))
    expect(
      await screen.findByText(
        "This code is not waiting for approval. It may have been used or has expired.",
      ),
    ).toBeTruthy()
  })

  it("falls back to a generic agent name and blocks approval with no organization", async () => {
    const auth = fakeAuth({
      getClientName: vi.fn(async () => null),
      listOrganizations: vi.fn(async () => []),
    })
    render(<DevicePage auth={auth} />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText("Code"), "WXYZ-9999")
    await user.click(screen.getByRole("button", { name: "Find request" }))
    expect(
      await screen.findByRole("heading", { name: "An agent wants to act for you" }),
    ).toBeTruthy()
    expect(
      screen.getByText("You do not belong to an organization, so there is nothing to grant."),
    ).toBeTruthy()
  })

  it("shows the server's message when the lookup fails", async () => {
    const auth = fakeAuth({
      device: {
        lookup: vi.fn(async () => {
          throw new Error("That code was not recognised")
        }),
        approve: vi.fn(async () => undefined),
        deny: vi.fn(async () => undefined),
      },
    })
    render(<DevicePage auth={auth} initialUserCode="BAD" />)
    await userEvent.setup().click(await screen.findByRole("button", { name: "Find request" }))
    expect(await screen.findByText("That code was not recognised")).toBeTruthy()
  })

  it("shows a load failure from the session", async () => {
    const auth = fakeAuth({
      getSession: vi.fn(async () => {
        throw new Error("Network down")
      }),
    })
    render(<DevicePage auth={auth} />)
    expect(await screen.findByText("Network down")).toBeTruthy()
  })
})
