import { afterEach, describe, expect, it, vi } from "vitest"
import { createClient } from "./client"

// The defaults the SDK uses when nothing is injected: the global fetch and real timers.
describe("defaults", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses the global fetch and waits with real timers between retries", async () => {
    const fetchMock = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const client = createClient({
      baseURL: "https://api.test",
      apiKey: "k",
      retry: { baseDelayMs: 1, maxDelayMs: 5 },
      random: () => 0,
    })
    expect(await client.request("GET", "/v1/whoami")).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
