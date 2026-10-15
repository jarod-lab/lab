// @vitest-environment jsdom
import { expectNoA11yViolations } from "@starter/ui/a11y"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { navigateTo } from "../lib/navigation"
import { fakeAuth } from "../test/fake-auth"
import { ConsentPage, SelectOrganizationPage } from "./oauth-pages"

vi.mock("../lib/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/navigation")>()),
  navigateTo: vi.fn(),
}))

const navigate = vi.mocked(navigateTo)

beforeEach(() => {
  navigate.mockReset()
})

const consentProps = { clientId: "client-1", scope: "openid read write" }

describe("ConsentPage", () => {
  it("has no accessibility violations once loaded", async () => {
    const { container } = render(<ConsentPage auth={fakeAuth()} {...consentProps} />)
    await screen.findByRole("button", { name: "Allow" })
    await expectNoA11yViolations(container.innerHTML)
  })

  it("names the client, the scopes in plain words and the organization", async () => {
    render(<ConsentPage auth={fakeAuth()} {...consentProps} />)
    expect(
      await screen.findByRole("heading", { name: "Allow Claude Code to connect?" }),
    ).toBeTruthy()
    expect(screen.getByText("Read data in the organization")).toBeTruthy()
    expect(screen.getByText("Create and change data in the organization")).toBeTruthy()
    expect(screen.getByRole("combobox", { name: "Organization" })).toHaveProperty("value", "org-a")
  })

  it("sets the chosen organization active before it accepts", async () => {
    const auth = fakeAuth({ consent: vi.fn(async () => "https://auth.example.com/done") })
    render(<ConsentPage auth={auth} {...consentProps} />)
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByRole("combobox", { name: "Organization" }), "org-b")
    await user.click(screen.getByRole("button", { name: "Allow" }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://auth.example.com/done"))
    expect(auth.setActiveOrganization).toHaveBeenCalledWith("org-b")
    expect(auth.consent).toHaveBeenCalledWith(true)
    const setActive = vi.mocked(auth.setActiveOrganization).mock.invocationCallOrder[0] ?? 0
    const accept = vi.mocked(auth.consent).mock.invocationCallOrder[0] ?? 0
    expect(setActive).toBeLessThan(accept)
  })

  it("does not switch organization when the active one is kept", async () => {
    const auth = fakeAuth()
    render(<ConsentPage auth={auth} {...consentProps} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Allow" }))

    await waitFor(() => expect(auth.consent).toHaveBeenCalledWith(true))
    expect(auth.setActiveOrganization).not.toHaveBeenCalled()
  })

  it("denies without changing the organization", async () => {
    const auth = fakeAuth({ consent: vi.fn(async () => "https://auth.example.com/denied") })
    render(<ConsentPage auth={auth} {...consentProps} />)
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByRole("combobox", { name: "Organization" }), "org-b")
    await user.click(screen.getByRole("button", { name: "Deny" }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://auth.example.com/denied"))
    expect(auth.consent).toHaveBeenCalledWith(false)
    expect(auth.setActiveOrganization).not.toHaveBeenCalled()
  })

  it("shows the error and re-enables the buttons when the server refuses", async () => {
    const auth = fakeAuth({
      consent: vi.fn(async () => {
        throw new Error("Scope not originally requested")
      }),
    })
    render(<ConsentPage auth={auth} {...consentProps} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Allow" }))

    expect(await screen.findByText("Scope not originally requested")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Allow" })).toHaveProperty("disabled", false)
  })

  it("asks the person to sign in when there is no session", async () => {
    render(
      <ConsentPage auth={fakeAuth({ getSession: vi.fn(async () => null) })} {...consentProps} />,
    )
    expect(await screen.findByRole("heading", { name: "Sign in to continue" })).toBeTruthy()
  })

  it("explains a request with no client id", async () => {
    render(<ConsentPage auth={fakeAuth()} clientId={undefined} scope={undefined} />)
    expect(await screen.findByText("This page needs an authorization request.")).toBeTruthy()
  })

  it("reports a failed load", async () => {
    const auth = fakeAuth({
      listOrganizations: vi.fn(async () => {
        throw new Error("Could not load organizations")
      }),
    })
    render(<ConsentPage auth={auth} {...consentProps} />)
    expect(await screen.findByText("Could not load organizations")).toBeTruthy()
  })

  it("shows the no-organization state with nothing to allow", async () => {
    const auth = fakeAuth({ listOrganizations: vi.fn(async () => []) })
    render(<ConsentPage auth={auth} {...consentProps} />)
    expect(
      await screen.findByText(
        "You do not belong to an organization, so there is nothing to grant.",
      ),
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "Allow" })).toHaveProperty("disabled", true)
  })

  it("uses a fallback client name and says when no scopes were asked for", async () => {
    const auth = fakeAuth({ getClientName: vi.fn(async () => null) })
    render(<ConsentPage auth={auth} clientId="client-2" scope={undefined} />)
    expect(
      await screen.findByRole("heading", { name: "Allow An application to connect?" }),
    ).toBeTruthy()
    expect(screen.getByText("No specific permissions were requested.")).toBeTruthy()
  })
})

describe("SelectOrganizationPage", () => {
  it("has no accessibility violations once loaded", async () => {
    const { container } = render(<SelectOrganizationPage auth={fakeAuth()} />)
    await screen.findByRole("button", { name: "Continue" })
    await expectNoA11yViolations(container.innerHTML)
  })

  it("sets the organization, then posts continue and follows it", async () => {
    const auth = fakeAuth({
      continueOAuth: vi.fn(async () => "https://auth.example.com/resumed"),
    })
    render(<SelectOrganizationPage auth={auth} />)
    const user = userEvent.setup()
    await user.selectOptions(await screen.findByRole("combobox", { name: "Organization" }), "org-b")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("https://auth.example.com/resumed"))
    expect(auth.setActiveOrganization).toHaveBeenCalledWith("org-b")
    expect(auth.continueOAuth).toHaveBeenCalledTimes(1)
    const setActive = vi.mocked(auth.setActiveOrganization).mock.invocationCallOrder[0] ?? 0
    const continued = vi.mocked(auth.continueOAuth).mock.invocationCallOrder[0] ?? 0
    expect(setActive).toBeLessThan(continued)
  })

  it("reports when the sign-in cannot be resumed", async () => {
    const auth = fakeAuth({ continueOAuth: vi.fn(async () => undefined) })
    render(<SelectOrganizationPage auth={auth} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Continue" }))

    expect(
      await screen.findByText(
        "The sign-in could not be resumed. Start it again from the application.",
      ),
    ).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("shows the server's message when continuing fails", async () => {
    const auth = fakeAuth({
      continueOAuth: vi.fn(async () => {
        throw new Error("Could not continue")
      }),
    })
    render(<SelectOrganizationPage auth={auth} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Continue" }))
    expect(await screen.findByText("Could not continue")).toBeTruthy()
  })

  it("asks for a sign-in when there is no session", async () => {
    render(<SelectOrganizationPage auth={fakeAuth({ getSession: vi.fn(async () => null) })} />)
    expect(await screen.findByRole("heading", { name: "Sign in first" })).toBeTruthy()
  })

  it("explains when the person belongs to no organization", async () => {
    render(<SelectOrganizationPage auth={fakeAuth({ listOrganizations: vi.fn(async () => []) })} />)
    expect(await screen.findByText("You do not belong to an organization yet.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", true)
  })

  it("reports a failed load", async () => {
    const auth = fakeAuth({
      getSession: vi.fn(async () => {
        throw new Error("Network down")
      }),
    })
    render(<SelectOrganizationPage auth={auth} />)
    expect(await screen.findByText("Network down")).toBeTruthy()
  })
})
