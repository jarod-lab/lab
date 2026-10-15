// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fakeAuth } from "../test/fake-auth"
import { InvitationPage } from "./invitation-page"

describe("InvitationPage", () => {
  it("offers sign-in or sign-up with the invited address when signed out", async () => {
    const auth = fakeAuth({ getSession: vi.fn(async () => null) })
    const { container } = render(<InvitationPage auth={auth} invitationId="inv-1" />)
    expect(await screen.findByRole("group", { name: "Sign in or create an account" })).toBeTruthy()
    expect(screen.getByText(/sent to/i)).toBeTruthy()
    await expectNoA11yViolations(container.innerHTML)
  })

  it("accepts the invitation once signed in", async () => {
    const auth = fakeAuth()
    const { container } = render(<InvitationPage auth={auth} invitationId="inv-1" />)
    const accept = await screen.findByRole("button", { name: "Accept invitation" })
    await userEvent.setup().click(accept)
    expect(await screen.findByRole("heading", { name: "You have joined" })).toBeTruthy()
    expect(auth.acceptInvitation).toHaveBeenCalledWith("inv-1")
    // Last: the axe check replaces document.body, which detaches the rendered tree.
    await expectNoA11yViolations(container.innerHTML)
  })

  it("signs in from the form and then shows the invitation", async () => {
    let signedIn = false
    const auth = fakeAuth({
      getSession: vi.fn(async () =>
        signedIn
          ? {
              user: { id: "u1", email: "ada@example.com", name: "Ada" },
              activeOrganizationId: null,
            }
          : null,
      ),
      signIn: vi.fn(async () => {
        signedIn = true
        return undefined
      }),
    })
    render(<InvitationPage auth={auth} invitationId="inv-1" />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("button", { name: "Accept invitation" })).toBeTruthy()
    expect(auth.signIn).toHaveBeenCalledTimes(1)
  })

  it("creates the account from the sign-up mode", async () => {
    let signedIn = false
    const auth = fakeAuth({
      getSession: vi.fn(async () =>
        signedIn
          ? {
              user: { id: "u2", email: "ada@example.com", name: "Ada" },
              activeOrganizationId: null,
            }
          : null,
      ),
      signUp: vi.fn(async () => {
        signedIn = true
        return undefined
      }),
    })
    render(<InvitationPage auth={auth} invitationId="inv-1" />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Create an account" }))
    await user.type(screen.getByLabelText("Name"), "Ada")
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByRole("button", { name: "Accept invitation" })).toBeTruthy()
    expect(auth.signUp).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      password: "correct-horse",
    })
  })

  it("explains an invitation that is no longer pending and blocks accepting it", async () => {
    const auth = fakeAuth({
      getInvitation: vi.fn(async () => ({
        id: "inv-1",
        organizationName: "Babbage Labs",
        email: "ada@example.com",
        role: "member",
        status: "canceled",
      })),
    })
    render(<InvitationPage auth={auth} invitationId="inv-1" />)
    expect(await screen.findByText("This invitation is canceled.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Accept invitation" })).toHaveProperty(
      "disabled",
      true,
    )
  })

  it("shows the server's message when accepting fails", async () => {
    const auth = fakeAuth({
      acceptInvitation: vi.fn(async () => {
        throw new Error("This invitation was sent to someone else")
      }),
    })
    render(<InvitationPage auth={auth} invitationId="inv-1" />)
    await userEvent.setup().click(await screen.findByRole("button", { name: "Accept invitation" }))
    expect(await screen.findByText("This invitation was sent to someone else")).toBeTruthy()
  })

  it("shows an error when the invitation cannot be loaded", async () => {
    const auth = fakeAuth({
      getInvitation: vi.fn(async () => {
        throw new Error("This invitation could not be found")
      }),
    })
    render(<InvitationPage auth={auth} invitationId="nope" />)
    await waitFor(() => expect(screen.getByText("This invitation could not be found")).toBeTruthy())
  })
})
