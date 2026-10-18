import { describe, expect, it, vi } from "vitest"

import { json, productFetch } from "../test/product-fetch"
import { createRunsApi } from "./runs-api"
import { currentSkewMs, resetServerClock } from "./server-clock"
import { WebError } from "./web-auth"

describe("createRunsApi", () => {
  it("sends the organization header and the status filter with the list", async () => {
    resetServerClock()
    const { fetchImpl, sent } = productFetch(() => json({ runs: [], nextCursor: null }))
    const api = createRunsApi(fetchImpl)
    await api.list("org-a", { status: "needs_you", cursor: "c1", limit: 20 })
    expect(sent[0]?.path).toBe("/v1/runs")
    expect(Object.fromEntries(new URLSearchParams(sent[0]?.search))).toEqual({
      limit: "20",
      status: "needs_you",
      cursor: "c1",
    })
    expect(sent[0]?.organization).toBe("org-a")
  })

  it("lists the first page of 50 when no input is given", async () => {
    const { fetchImpl, sent } = productFetch(() => json({ runs: [], nextCursor: null }))
    await createRunsApi(fetchImpl).list("org-a")
    expect(sent[0]?.search).toBe("?limit=50")
  })

  it("posts a decision and undo to the approval routes", async () => {
    const { fetchImpl, sent } = productFetch(() => json({ id: "ap1", status: "approved" }))
    const api = createRunsApi(fetchImpl)
    await api.decide("org-a", "ap1", "approve")
    await api.undo("org-a", "ap1")
    expect(sent[0]).toMatchObject({ method: "POST", path: "/v1/approvals/ap1/decision" })
    expect(sent[0]?.body).toEqual({ decision: "approve" })
    expect(sent[1]).toMatchObject({ method: "POST", path: "/v1/approvals/ap1/undo" })
  })

  it("records the server's clock from the Date header", async () => {
    resetServerClock()
    const { fetchImpl } = productFetch(() =>
      json({ needsYou: 2 }, { date: new Date(Date.now() + 60_000).toUTCString() }),
    )
    expect(await createRunsApi(fetchImpl).inbox("org-a")).toEqual({ needsYou: 2 })
    expect(currentSkewMs()).toBeGreaterThan(50_000)
    resetServerClock()
  })

  it("turns a refusal into a WebError with the status and the server's hint", async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        { error: { code: "NOT_FOUND", message: "Run not found", hint: "Check the link." } },
        { status: 404 },
      ),
    ) as unknown as typeof fetch
    const error = await createRunsApi(fetchImpl)
      .get("org-a", "r1")
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).status).toBe(404)
    expect((error as WebError).message).toBe("Run not found Check the link.")
  })
})
