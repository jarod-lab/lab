import { describe, expect, it } from "vitest"
import { createAuth } from "./index"

const make = (extra = {}) =>
  createAuth({
    db: {} as never,
    secret: "a-test-secret-that-is-long-enough-123456", // gitleaks:allow
    baseURL: "http://localhost:3000",
    emailFrom: "Test <auth@example.com>",
    ...extra,
  })

describe("createAuth", () => {
  it("builds a handler and api", () => {
    const auth = make()
    expect(typeof auth.handler).toBe("function")
    expect(auth.api).toBeDefined()
  })

  it("accepts a Wraps API key to enable contact sync", () => {
    expect(make({ wrapsApiKey: "wraps_test" }).handler).toBeDefined()
  })

  it("refuses a live Stripe key before anything can be charged", () => {
    expect(() =>
      make({
        stripe: { secretKey: "sk_live_placeholder", webhookSecret: "whsec_x" }, // gitleaks:allow
      }),
    ).toThrow(/test mode only/)
  })

  it("mounts the stripe plugin only when a test-mode key is configured", () => {
    const ids = (auth: ReturnType<typeof make>) => (auth.options.plugins ?? []).map((p) => p.id)
    expect(ids(make())).not.toContain("stripe")
    const billed = make({
      stripe: { secretKey: "sk_test_placeholder", webhookSecret: "whsec_x" }, // gitleaks:allow
    })
    expect(ids(billed)).toContain("stripe")
    expect(ids(billed)).toEqual(expect.arrayContaining(["sso", "scim", "starter-owner-only"]))
  })
})
