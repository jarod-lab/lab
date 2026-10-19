import { afterEach, describe, expect, it, vi } from "vitest"

import { WebError } from "../web-auth"
import { fetchBillingUsage } from "./usage"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchBillingUsage", () => {
  it("reads today's count and limit from whoami, for the organization the page shows", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ usage: { day: "2026-10-16", total: 3, limit: 500 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    )
    vi.stubGlobal("fetch", fetchMock)

    expect(await fetchBillingUsage("org-a")).toEqual({
      day: "2026-10-16",
      total: 3,
      limit: 500,
    })
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe("/v1/whoami")
    expect(new Headers(init.headers).get("X-Organization-Id")).toBe("org-a")
  })

  it("throws a WebError with the server's message when the call is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Sign in again" } }), { status: 401 }),
      ),
    )
    const failure = await fetchBillingUsage("org-a").catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(WebError)
    expect((failure as WebError).message).toBe("Sign in again")
    expect((failure as WebError).status).toBe(401)
  })
})
