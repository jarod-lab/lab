import { describe, expect, it } from "vitest"
import { personalSlug } from "./client"
import { signInMethodsOf } from "./sign-in-methods"

describe("signInMethodsOf", () => {
  it("offers password, magic link, passkey and SSO on a server with no optional config", () => {
    expect(signInMethodsOf({})).toEqual({
      password: true,
      magicLink: true,
      passkey: true,
      social: [],
      sso: true,
      stripe: false,
    })
  })

  it("offers a social provider only when both its values are set", () => {
    const github = { clientId: "id", clientSecret: "secret" }
    expect(signInMethodsOf({ github }).social).toEqual(["github"])
    expect(signInMethodsOf({ github: { clientId: "id", clientSecret: "" } }).social).toEqual([])
    expect(signInMethodsOf({ google: { clientId: "", clientSecret: "s" } }).social).toEqual([])
    expect(signInMethodsOf({ github, google: github }).social).toEqual(["github", "google"])
  })

  it("reports stripe only when it is configured with a plan", () => {
    expect(
      signInMethodsOf({ stripe: { plans: [{ name: "team", priceId: "price_x" }] } }).stripe,
    ).toBe(true)
    expect(signInMethodsOf({ stripe: { plans: [] } }).stripe).toBe(false)
    expect(signInMethodsOf({ stripe: {} }).stripe).toBe(false)
  })
})

describe("personalSlug", () => {
  it("is the lower-cased user id under the personal prefix", () => {
    expect(personalSlug("User-ABC123")).toBe("personal-user-abc123")
  })
})
