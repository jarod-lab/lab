// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"

import { payload, productClient, toWebError } from "./product-client"
import { WebError } from "./web-auth"

function json(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...init.headers },
    ...init,
  })
}

const fetchStub = (reply: () => Response) => vi.fn(async (_request: Request) => reply())

describe("productClient", () => {
  it("calls the page's origin with the organization header and the session cookie", async () => {
    const fetchImpl = fetchStub(() => json({ agents: [] }))
    await payload(
      productClient("org-a", fetchImpl as unknown as typeof fetch).GET("/v1/workspace-agents"),
    )
    const request = fetchImpl.mock.calls[0]?.[0] as Request
    expect(request.url).toBe(`${window.location.origin}/v1/workspace-agents`)
    expect(request.headers.get("X-Organization-Id")).toBe("org-a")
    expect(request.headers.get("accept")).toBe("application/json")
    expect(request.credentials).toBe("same-origin")
  })

  it("sends no organization header when none is given", async () => {
    const fetchImpl = fetchStub(() => json({ agents: [] }))
    await payload(productClient(undefined, fetchImpl as unknown as typeof fetch).GET("/v1/agents"))
    const request = fetchImpl.mock.calls[0]?.[0] as Request
    expect(request.headers.has("X-Organization-Id")).toBe(false)
  })

  it("makes one attempt, even when the server asks to wait", async () => {
    const fetchImpl = fetchStub(() =>
      json(
        { error: { code: "RATE_LIMITED", message: "Slow down" } },
        { status: 429, headers: { "retry-after": "30" } },
      ),
    )
    const error = await payload(
      productClient("org-a", fetchImpl as unknown as typeof fetch).GET("/v1/runs"),
    ).catch((caught: unknown) => caught)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).status).toBe(429)
  })
})

describe("body and toWebError", () => {
  it("keeps the server's message and appends its hint", async () => {
    const fetchImpl = fetchStub(() =>
      json(
        { error: { code: "NOT_FOUND", message: "Run not found", hint: "Check the link." } },
        { status: 404 },
      ),
    )
    const error = await payload(
      productClient("org-a", fetchImpl as unknown as typeof fetch).GET("/v1/runs/{id}", {
        params: { path: { id: "r1" } },
      }),
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).status).toBe(404)
    expect((error as WebError).message).toBe("Run not found Check the link.")
  })

  it("shows the message alone when there is no hint", async () => {
    const fetchImpl = fetchStub(() =>
      json({ error: { code: "FORBIDDEN", message: "Not allowed" } }, { status: 403 }),
    )
    const error = await payload(
      productClient("org-a", fetchImpl as unknown as typeof fetch).GET("/v1/inbox"),
    ).catch((caught: unknown) => caught)
    expect((error as WebError).message).toBe("Not allowed")
  })

  it("uses the generic text when the failure has no API body", async () => {
    const fetchImpl = fetchStub(() => new Response("gateway down", { status: 502 }))
    const error = await payload(
      productClient("org-a", fetchImpl as unknown as typeof fetch).GET("/v1/inbox"),
    ).catch((caught: unknown) => caught)
    expect((error as WebError).message).toBe("Something went wrong")
    expect((error as WebError).status).toBe(502)
  })

  it("explains a transport failure with the SDK's hint", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed")
    })
    const error = await payload(
      productClient("org-a", fetchImpl as unknown as typeof fetch).GET("/v1/inbox"),
    ).catch((caught: unknown) => caught)
    expect((error as WebError).status).toBe(0)
    expect((error as WebError).message).toMatch(/^Could not reach .+ Check the base URL/)
  })

  it("passes other errors through unchanged", () => {
    const plain = new Error("boom")
    expect(toWebError(plain)).toBe(plain)
  })
})
