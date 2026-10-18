// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { createAgentsApi } from "./agents-api"
import { WebError } from "./web-auth"

/** A fetch stub that records each request the client sends (method, path and search, cookie mode). */
function recorder(response: () => Response) {
  const calls: Array<{ method: string; target: string; credentials: RequestCredentials }> = []
  const fetchImpl = (async (input: Request) => {
    const url = new URL(input.url)
    calls.push({
      method: input.method,
      target: `${url.pathname}${url.search}`,
      credentials: input.credentials,
    })
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
      clientId: null,
      keyId: "k1",
      name: "CI bot",
      createdAt: "2026-10-01T00:00:00Z",
      lastUsedAt: null,
      access: ["project:read"],
    }
    const { fetchImpl, calls } = recorder(() => json({ agents: [agent] }))
    await expect(createAgentsApi(undefined, fetchImpl).listAgents()).resolves.toEqual([agent])
    expect(calls[0]).toMatchObject({
      method: "GET",
      target: "/v1/agents",
      credentials: "same-origin",
    })
  })

  it("revokes an agent by id", async () => {
    const { fetchImpl, calls } = recorder(() => json({ revoked: true }))
    await createAgentsApi(undefined, fetchImpl).revokeAgent("a/1")
    expect(calls[0]).toMatchObject({ method: "DELETE", target: "/v1/agents/a%2F1" })
  })

  it("pages audit events with the cursor", async () => {
    const { fetchImpl, calls } = recorder(() => json({ events: [], nextCursor: null }))
    const api = createAgentsApi(undefined, fetchImpl)
    await expect(api.listAuditEvents()).resolves.toEqual({ events: [], nextCursor: null })
    expect(calls[0]?.target).toBe("/v1/audit-events")
    await api.listAuditEvents("abc=")
    expect(calls[1]?.target).toBe("/v1/audit-events?cursor=abc%3D")
  })

  it("sends the organization header when given one", async () => {
    const seen: Array<string | null> = []
    const fetchImpl = (async (input: Request) => {
      seen.push(input.headers.get("X-Organization-Id"))
      return json({ agents: [] })
    }) as typeof fetch
    await createAgentsApi("org-a", fetchImpl).listAgents()
    expect(seen).toEqual(["org-a"])
  })

  it("throws the server's message and hint for a refused call", async () => {
    const { fetchImpl } = recorder(() =>
      json({ error: { code: "FORBIDDEN", message: "Needs admin", hint: "Ask an owner." } }, 403),
    )
    const error = await createAgentsApi(undefined, fetchImpl)
      .revokeAgent("a1")
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect(error).toMatchObject({ message: "Needs admin Ask an owner.", status: 403 })
  })

  it("falls back to a generic message when the error body is not JSON", async () => {
    const { fetchImpl } = recorder(() => new Response("gateway down", { status: 502 }))
    await expect(createAgentsApi(undefined, fetchImpl).listAgents()).rejects.toThrow(
      "Something went wrong",
    )
  })
})
