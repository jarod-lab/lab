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
})
