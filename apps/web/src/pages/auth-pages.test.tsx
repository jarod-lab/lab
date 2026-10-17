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
    await user.click(screen.getByRole("button", { name: "Sign in with email" }))

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
    await user.click(screen.getByRole("button", { name: "Sign in with email" }))

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
    await user.click(screen.getByRole("button", { name: "Sign in with email" }))

    expect(await screen.findByText("Invalid email or password")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sign in with email" })).toHaveProperty(
      "disabled",
      false,
    )
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
    await user.type(screen.getByLabelText("Work email"), "ada@example.com")
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

describe("SignInPage methods", () => {
  const methods = {
    password: true,
    magicLink: true,
    passkey: true,
    social: ["github" as const],
    sso: true,
    stripe: false,
  }

  it("offers the server's methods and badges the one last used", async () => {
    const auth = fakeAuth({
      signInMethods: vi.fn(async () => methods),
      lastUsedMethod: vi.fn(() => "passkey"),
    })
    render(<SignInPage auth={auth} next="/settings/agents" signUpHref="/sign-up" />)
    expect(await screen.findByRole("button", { name: /Sign in with passkey/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Continue with GitHub/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Continue with Google/ })).toBeNull()
    expect(screen.getByRole("button", { name: /Sign in with SSO/ })).toBeTruthy()
    expect(screen.getByText("Last used")).toBeTruthy()
  })

  it("emails a sign-in link and says to check the inbox", async () => {
    const sendMagicLink = vi.fn(async () => undefined)
    const auth = fakeAuth({ signInMethods: vi.fn(async () => methods), sendMagicLink })
    render(<SignInPage auth={auth} next="/settings/agents" signUpHref="/sign-up" />)
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText("Email"), "ada@example.com")
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }))
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy()
    expect(sendMagicLink).toHaveBeenCalledWith({
      email: "ada@example.com",
      callbackURL: expect.stringMatching(/\/settings\/agents$/),
    })
  })

  it("asks for an email before the link or SSO buttons send anything", async () => {
    const auth = fakeAuth({ signInMethods: vi.fn(async () => methods) })
    render(<SignInPage auth={auth} next="/settings/agents" signUpHref="/sign-up" />)
    await userEvent.setup().click(await screen.findByRole("button", { name: "Sign in with SSO" }))
    expect(await screen.findByText("Enter your email address first.")).toBeTruthy()
    expect(auth.signInWithSso).toBeUndefined()
  })
})

describe("SignUpPage breached password", () => {
  it("names the password field with the breach message", async () => {
    const auth = fakeAuth({
      signUp: vi.fn(async () => {
        throw Object.assign(new Error("This password has shown up in a known data breach."), {
          code: "PASSWORD_COMPROMISED",
        })
      }),
    })
    render(<SignUpPage auth={auth} next="/consent" signInHref="/sign-in" />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Name"), "Ada")
    await user.type(screen.getByLabelText("Work email"), "ada@example.com")
    await user.type(screen.getByLabelText("Password"), "Summer2024!")
    await user.click(screen.getByRole("button", { name: "Create account" }))

    expect(
      await screen.findByText(
        "This password has shown up in a known data breach. Choose a different one.",
      ),
    ).toBeTruthy()
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByText(/Your password is never sent\./)).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })
})
