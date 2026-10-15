// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { fakeAuth } from "../test/fake-auth"
import { NotYou } from "./not-you"

describe("NotYou", () => {
  it("signs out and tells the page so it can show sign-in again", async () => {
    const auth = fakeAuth()
    const onSignedOut = vi.fn()
    render(<NotYou auth={auth} onSignedOut={onSignedOut} />)
    await userEvent.setup().click(screen.getByRole("button", { name: /sign out/i }))
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1))
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it("shows the failure and does not report a sign-out when it fails", async () => {
    const auth = fakeAuth({ signOut: vi.fn(async () => Promise.reject(new Error("Network down"))) })
    const onSignedOut = vi.fn()
    render(<NotYou auth={auth} onSignedOut={onSignedOut} />)
    await userEvent.setup().click(screen.getByRole("button", { name: /sign out/i }))
    expect(await screen.findByText("Network down")).toBeTruthy()
    expect(onSignedOut).not.toHaveBeenCalled()
  })
})
