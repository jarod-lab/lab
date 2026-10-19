import { describe, expect, it, vi } from "vitest"

import { addSignUpPasskey, passkeyLandingPath, sendPasskeySignUpLink } from "./passkey-signup"
import { type AuthClient, WebError } from "./web-auth"

function fakeClient(start: unknown = { data: { sent: true }, error: null }, added?: unknown) {
  const $fetch = vi.fn(async () => start)
  const addPasskey = vi.fn(async () => added ?? { data: {}, error: null })
  return {
    client: { $fetch, passkey: { addPasskey } } as unknown as AuthClient,
    $fetch,
    addPasskey,
  }
}

describe("sendPasskeySignUpLink", () => {
  it("sends the landing page as the callback, so the link ends on the passkey step", async () => {
    const { client, $fetch } = fakeClient()
    await sendPasskeySignUpLink(client, {
      name: "Ada",
      email: "ada@example.com",
      callbackURL: passkeyLandingPath("/consent"),
    })
    expect($fetch).toHaveBeenCalledWith("/passkey-signup/start", {
      method: "POST",
      body: {
        name: "Ada",
        email: "ada@example.com",
        callbackURL: "/sign-up/passkey?next=%2Fconsent",
      },
    })
  })

  it("asks the server to email the link, and passes no session or credential", async () => {
    const { client, $fetch, addPasskey } = fakeClient()
    await sendPasskeySignUpLink(client, { name: "Ada", email: "ada@example.com" })
    expect($fetch).toHaveBeenCalledWith("/passkey-signup/start", {
      method: "POST",
      body: { name: "Ada", email: "ada@example.com" },
    })
    expect(addPasskey).not.toHaveBeenCalled()
  })

  it("shows the server's refusal", async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: "An account already exists for this email. Use sign-in.", status: 409 },
    })
    const failed = sendPasskeySignUpLink(client, { name: "Ada", email: "ada@example.com" })
    await expect(failed).rejects.toBeInstanceOf(WebError)
    await expect(failed).rejects.toThrow("An account already exists for this email. Use sign-in.")
  })
})

describe("addSignUpPasskey", () => {
  it("adds the passkey through the session-bound registration", async () => {
    const { client, addPasskey } = fakeClient()
    await addSignUpPasskey(client, "Laptop")
    expect(addPasskey).toHaveBeenCalledWith({ name: "Laptop" })
  })

  it("reports a cancelled passkey prompt with the server's message", async () => {
    const { client } = fakeClient(undefined, {
      data: null,
      error: { message: "The passkey prompt was cancelled", status: 400 },
    })
    await expect(addSignUpPasskey(client, "Laptop")).rejects.toThrow(
      "The passkey prompt was cancelled",
    )
  })
})
