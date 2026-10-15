// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { navigateTo } from "../lib/navigation"
import { fakeAuth } from "../test/fake-auth"
import { SignInPage, SignUpPage } from "./auth-pages"

vi.mock("../lib/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/navigation")>()),
  navigateTo: vi.fn(),
}))

const navigate = vi.mocked(navigateTo)

beforeEach(() => {
  navigate.mockReset()
})

describe("SignInPage", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(
      <SignInPage auth={fakeAuth()} next="/settings/agents" signUpHref="/sign-up" />,
    )
    await expectNoA11yViolations(container.innerHTML)
  })

  it("signs in and goes to the next page", async () => {
    const auth = fakeAuth()
    render(<SignInPage auth={auth} next="/settings/agents" signUpHref="/sign-up" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(auth.signIn).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct-horse",
    })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/settings/agents"))
  })

  it("resumes a pending OAuth flow at the URL the server returns", async () => {
    const auth = fakeAuth({ signIn: vi.fn(async () => "https://auth.example.com/resume") })
    render(<SignInPage auth={auth} next="/settings/agents" signUpHref="/sign-up" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://auth.example.com/resume"))
  })

  it("shows the server's message and lets the person try again", async () => {
    const auth = fakeAuth({
      signIn: vi.fn(async () => {
        throw new Error("Invalid email or password")
      }),
    })
    render(<SignInPage auth={auth} next="/settings/agents" signUpHref="/sign-up" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "wrong-pass")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByText("Invalid email or password")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty("disabled", false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe("SignUpPage", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(
      <SignUpPage auth={fakeAuth()} next="/consent" signInHref="/sign-in" />,
    )
    await expectNoA11yViolations(container.innerHTML)
  })

  it("creates the account with a name and goes to the next page", async () => {
    const auth = fakeAuth()
    render(<SignUpPage auth={auth} next="/consent" signInHref="/sign-in" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Name"), "Ada")
    await user.type(screen.getByLabelText("Email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Create account" }))

    expect(auth.signUp).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      password: "correct-horse",
    })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/consent"))
  })
})
