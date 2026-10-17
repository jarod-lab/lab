import { describe, expect, it, vi } from "vitest"

import { createRunsApi } from "./runs-api"
import { resetServerClock, currentSkewMs } from "./server-clock"
import { WebError } from "./web-auth"

function json(body: unknown, init: { status?: number; date?: string } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.date ? { date: init.date } : {}) },
  })
}

describe("createRunsApi", () => {
  it("sends the organization header and the status filter with the list", async () => {
    resetServerClock()
    const fetchImpl = vi.fn(async () => json({ runs: [], nextCursor: null }))
    const api = createRunsApi(fetchImpl as unknown as typeof fetch)
    await api.list("org-a", { status: "needs_you", cursor: "c1", limit: 20 })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/v1/runs?limit=20&status=needs_you&cursor=c1")
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe("org-a")
  })

  it("posts a decision and undo to the approval routes", async () => {
    const fetchImpl = vi.fn(async () => json({ id: "ap1", status: "approved" }))
    const api = createRunsApi(fetchImpl as unknown as typeof fetch)
    await api.decide("org-a", "ap1", "approve")
    await api.undo("org-a", "ap1")
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0]?.[0]).toBe("/v1/approvals/ap1/decision")
    expect(calls[0]?.[1].body).toBe(JSON.stringify({ decision: "approve" }))
    expect(calls[1]?.[0]).toBe("/v1/approvals/ap1/undo")
  })

  it("records the server's clock from the Date header", async () => {
    resetServerClock()
    const api = createRunsApi(
      vi.fn(async () =>
        json({ needsYou: 2 }, { date: new Date(Date.now() + 60_000).toUTCString() }),
      ) as unknown as typeof fetch,
    )
    expect(await api.inbox("org-a")).toEqual({ needsYou: 2 })
    expect(currentSkewMs()).toBeGreaterThan(50_000)
    resetServerClock()
  })

  it("turns a refusal into a WebError with the status and the server's hint", async () => {
    const api = createRunsApi(
      vi.fn(async () =>
        json(
          { error: { code: "NOT_FOUND", message: "Run not found", hint: "Check the link." } },
          { status: 404 },
        ),
      ) as unknown as typeof fetch,
    )
    const error = await api.get("org-a", "r1").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).status).toBe(404)
    expect((error as WebError).message).toBe("Run not found Check the link.")
  })
})
