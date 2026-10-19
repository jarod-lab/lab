import { afterEach, describe, expect, it, vi } from "vitest"
import { createTestApp } from "./app.test.helpers"

// better-auth reads the client address from x-starter-client-ip (its rate limiter keys on it).
// These check what reaches auth.handler, with the real app and auth on PGlite.
const HEADER = "x-starter-client-ip"

type TestApp = Awaited<ReturnType<typeof createTestApp>>

describe("client IP for better-auth", () => {
  let t: TestApp | undefined

  afterEach(async () => {
    await t?.close()
    t = undefined
    vi.restoreAllMocks()
  })

  /** Sends one request to an auth route and returns the header better-auth received. */
  async function seenByAuth(app: TestApp, headers: Record<string, string>): Promise<string | null> {
    const spy = vi.spyOn(app.auth, "handler")
    await app.req("/api/auth/ok", { headers })
    const received = spy.mock.calls[0]?.[0]
    if (!(received instanceof Request)) throw new Error("auth.handler was not called")
    return received.headers.get(HEADER)
  }

  it("replaces a client-sent copy with the address behind a trusted proxy", async () => {
    t = await createTestApp([], { trustProxy: true })
    const seen = await seenByAuth(t, {
      "x-forwarded-for": "203.0.113.7",
      [HEADER]: "9.9.9.9",
    })
    expect(seen).toBe("203.0.113.7")
  })

  it("uses the rightmost X-Forwarded-For entry, the one our proxy added", async () => {
    t = await createTestApp([], { trustProxy: true })
    const seen = await seenByAuth(t, { "x-forwarded-for": "10.0.0.1, 198.51.100.4" })
    expect(seen).toBe("198.51.100.4")
  })

  it("ignores X-Forwarded-For and a spoofed copy when the proxy is not trusted", async () => {
    t = await createTestApp([], { trustProxy: false })
    const seen = await seenByAuth(t, {
      "x-forwarded-for": "203.0.113.7",
      [HEADER]: "9.9.9.9",
    })
    // No socket in app.request, so there is no address to set: the spoofed copy is gone.
    expect(seen).toBeNull()
  })
})
