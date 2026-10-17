import { describe, expect, it, vi } from "vitest"

import { createWorkspaceAgentsApi } from "./workspace-agents-api"
import { WebError } from "./web-auth"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("createWorkspaceAgentsApi", () => {
  it("sends the organization header with every call", async () => {
    const fetchImpl = vi.fn(async () => json({ agents: [] }))
    await createWorkspaceAgentsApi(fetchImpl as unknown as typeof fetch).list("org-1")
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/v1/workspace-agents")
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe("org-1")
  })

  it("creates, patches and deletes by id", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json({ deleted: true }) : json({ id: "a1" }),
    )
    const api = createWorkspaceAgentsApi(fetchImpl as unknown as typeof fetch)
    await api.create("org-1", { name: "Release triage", description: null })
    await api.update("org-1", "a1", { pinned: true })
    await api.remove("org-1", "a1")
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0]?.[1]?.method).toBe("POST")
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
      name: "Release triage",
      description: null,
    })
    expect(calls[1]?.[0]).toBe("/v1/workspace-agents/a1")
    expect(calls[1]?.[1]?.method).toBe("PATCH")
    expect(calls[2]?.[1]?.method).toBe("DELETE")
  })

  it("counts runs across pages", async () => {
    const pages = [
      { runs: [{}, {}], nextCursor: "c1" },
      { runs: [{}], nextCursor: null },
    ]
    const fetchImpl = vi.fn(async () => json(pages.shift()))
    const count = await createWorkspaceAgentsApi(fetchImpl as unknown as typeof fetch).countRuns(
      "org-1",
      "a1",
    )
    expect(count).toBe(3)
    const second = fetchImpl.mock.calls[1] as unknown as [string]
    expect(second[0]).toContain("agentId=a1")
    expect(second[0]).toContain("cursor=c1")
  })

  it("throws the server's message and hint", async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: { code: "FORBIDDEN", message: "Not allowed", hint: "Ask an owner." } }, 403),
    )
    const error = await createWorkspaceAgentsApi(fetchImpl as unknown as typeof fetch)
      .remove("org-1", "a1")
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).message).toBe("Not allowed Ask an owner.")
    expect((error as WebError).status).toBe(403)
  })
})
