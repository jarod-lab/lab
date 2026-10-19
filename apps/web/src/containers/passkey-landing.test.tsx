// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { AuthClient } from "../lib/web-auth"
import { WebError } from "../lib/web-auth"
import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { PasskeyLandingContainer } from "./passkey-landing"

function fakeClient(added: unknown = { data: {}, error: null }) {
  const addPasskey = vi.fn(async () => added)
  return { client: { passkey: { addPasskey } } as unknown as AuthClient, addPasskey }
}

function renderLanding(options: { signedIn?: boolean; added?: unknown; next?: string } = {}) {
  const { client, addPasskey } = fakeClient(options.added)
  const auth = fakeAuth({
    getSession: vi.fn(async () =>
      options.signedIn === false
        ? null
        : {
            user: { id: "user-1", email: "ada@example.com", name: "Ada" },
            activeOrganizationId: null,
          },
    ),
  })
  const navigate = vi.fn()
  renderWithClient(
    <PasskeyLandingContainer
      auth={auth}
      next={options.next ?? "/consent"}
      signUpHref="/sign-up"
      client={client}
      navigate={navigate}
    />,
  )
  return { addPasskey, navigate, auth }
}

describe("PasskeyLandingContainer", () => {
  it("offers the passkey once the link has signed the person in, and does not prompt on load", async () => {
    const { addPasskey } = renderLanding()
    expect(await screen.findByRole("heading", { name: "Add a passkey" })).toBeTruthy()
    expect(addPasskey).not.toHaveBeenCalled()
  })

  it("says the link did not sign anyone in, and offers to start again", async () => {
    renderLanding({ signedIn: false })
    expect(
      await screen.findByRole("heading", { name: "This link didn't sign you in" }),
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: "Start again" }).getAttribute("href")).toBe("/sign-up")
  })

  it("explains a refused link without checking for a session, and offers start again or sign in", async () => {
    const auth = fakeAuth()
    renderWithClient(
      <PasskeyLandingContainer
        auth={auth}
        next="/"
        signUpHref="/sign-up"
        signInHref="/sign-in"
        linkError="PASSKEY_SIGNUP_EXPIRED"
        client={fakeClient().client}
        navigate={vi.fn()}
      />,
    )
    expect(
      await screen.findByRole("heading", { name: "This sign-up link can't be used" }),
    ).toBeTruthy()
    expect(screen.getByRole("link", { name: "Start again" }).getAttribute("href")).toBe("/sign-up")
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in")
    expect(auth.getSession).not.toHaveBeenCalled()
  })

  it("creates the passkey on a click, then says so and continues to the next page", async () => {
    const user = userEvent.setup()
    const { addPasskey, navigate } = renderLanding()
    await user.click(await screen.findByRole("button", { name: "Create passkey" }))
    await waitFor(() => expect(addPasskey).toHaveBeenCalledWith({ name: "Sign-up passkey" }))
    expect(await screen.findByRole("heading", { name: "Your passkey is ready" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(navigate).toHaveBeenCalledWith("/consent")
  })

  it("shows the refusal and offers to try again, without leaving the page", async () => {
    const user = userEvent.setup()
    const { client } = fakeClient()
    const addPasskey = vi.fn(async () => {
      throw new WebError("The passkey was cancelled.", 0)
    })
    const auth = fakeAuth()
    const navigate = vi.fn()
    renderWithClient(
      <PasskeyLandingContainer
        auth={auth}
        next="/"
        signUpHref="/sign-up"
        client={{ ...client, passkey: { addPasskey } } as unknown as AuthClient}
        navigate={navigate}
      />,
    )
    await user.click(await screen.findByRole("button", { name: "Create passkey" }))
    const alert = await screen.findByRole("alert")
    expect(within(alert).getByText("The passkey was cancelled.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("skips the passkey and continues, leaving the account as it is", async () => {
    const user = userEvent.setup()
    const { addPasskey, navigate } = renderLanding({ next: "/" })
    await user.click(await screen.findByRole("button", { name: "Skip for now" }))
    expect(navigate).toHaveBeenCalledWith("/")
    expect(addPasskey).not.toHaveBeenCalled()
  })
})
