// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { createAgentsApi } from "./agents-api"
import { WebError } from "./web-auth"

function recorder(response: () => Response) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return response()
  }) as typeof fetch
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("createAgentsApi", () => {
  it("lists connected agents from GET /v1/agents with the session cookie", async () => {
    const agent = {
      id: "a1",
      type: "apiKey",
      name: "CI bot",
      createdAt: "2026-10-01T00:00:00Z",
      lastUsedAt: null,
      access: ["project:read"],
    }
    const { fetchImpl, calls } = recorder(() => json({ agents: [agent] }))
    await expect(createAgentsApi(fetchImpl).listAgents()).resolves.toEqual([agent])
    expect(calls[0]?.url).toBe("/v1/agents")
    expect(calls[0]?.init).toMatchObject({ credentials: "same-origin" })
  })

  it("revokes an agent by id", async () => {
    const { fetchImpl, calls } = recorder(() => json({ revoked: true }))
    await createAgentsApi(fetchImpl).revokeAgent("a/1")
    expect(calls[0]?.url).toBe("/v1/agents/a%2F1")
    expect(calls[0]?.init?.method).toBe("DELETE")
  })

  it("pages audit events with the cursor", async () => {
    const { fetchImpl, calls } = recorder(() => json({ events: [], nextCursor: null }))
    const api = createAgentsApi(fetchImpl)
    await expect(api.listAuditEvents()).resolves.toEqual({ events: [], nextCursor: null })
    expect(calls[0]?.url).toBe("/v1/audit-events")
    await api.listAuditEvents("abc=")
    expect(calls[1]?.url).toBe("/v1/audit-events?cursor=abc%3D")
  })

  it("throws the server's message for a refused call", async () => {
    const { fetchImpl } = recorder(() =>
      json({ error: { code: "FORBIDDEN", message: "Needs admin" } }, 403),
    )
    const error = await createAgentsApi(fetchImpl)
      .revokeAgent("a1")
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect(error).toMatchObject({ message: "Needs admin", status: 403 })
  })

  it("falls back to a generic message when the error body is not JSON", async () => {
    const { fetchImpl } = recorder(() => new Response("gateway down", { status: 502 }))
    await expect(createAgentsApi(fetchImpl).listAgents()).rejects.toThrow("Something went wrong")
  })
})
