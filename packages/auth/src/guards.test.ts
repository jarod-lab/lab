// Every GET endpoint the configured plugins mount is decided: a read (an impersonated session may
// call it) or refused. A new GET from an upgrade must be classified here, or this test fails.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestAuth } from "./auth.test.helpers"
import {
  IMPERSONATION_ALLOWED_PATHS,
  IMPERSONATION_READ_GET_PATHS,
  IMPERSONATION_REFUSED_GET_PATHS,
  impersonationAllows,
} from "./guards"

describe("impersonation guard", () => {
  let h: Awaited<ReturnType<typeof createTestAuth>>
  beforeAll(async () => {
    h = await createTestAuth()
    // Boot seeds the OAuth resources; let that finish before the database closes.
    await h.auth.$context
  })
  afterAll(() => h.close())

  it("classifies every GET endpoint the plugins mount, and only once", () => {
    const decided = new Set<string>([
      ...IMPERSONATION_READ_GET_PATHS,
      ...IMPERSONATION_REFUSED_GET_PATHS,
    ])
    expect(decided.size).toBe(
      IMPERSONATION_READ_GET_PATHS.length + IMPERSONATION_REFUSED_GET_PATHS.length,
    )

    const api = h.auth.api as unknown as Record<
      string,
      { path?: string; options?: { method?: unknown } }
    >
    const gets = Object.values(api)
      .filter((endpoint) => {
        const method = endpoint?.options?.method
        return Array.isArray(method) ? method.includes("GET") : method === "GET"
      })
      .map((endpoint) => endpoint.path ?? "")
    expect(gets.length).toBeGreaterThan(20)
    const undecided = gets.filter((path) => !decided.has(path))
    expect(undecided).toEqual([])
  })

  it("answers only the end-of-impersonation paths for non-GET methods", () => {
    expect(IMPERSONATION_ALLOWED_PATHS).toEqual(["/admin/stop-impersonating", "/sign-out"])
    expect(impersonationAllows("/admin/stop-impersonating", "POST")).toBe(true)
    expect(impersonationAllows("/sign-out", "POST")).toBe(true)
    expect(impersonationAllows("/get-session", "GET")).toBe(true)
    expect(impersonationAllows("/get-session", "POST")).toBe(false)
    expect(impersonationAllows("/unknown-future-endpoint", "GET")).toBe(false)
    expect(impersonationAllows("/passkey/generate-register-options", "GET")).toBe(false)
  })
})
