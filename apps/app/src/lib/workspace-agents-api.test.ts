import { describe, expect, it } from "vitest"

import { json, productFetch } from "../test/product-fetch"
import { WebError } from "./web-auth"
import { createWorkspaceAgentsApi } from "./workspace-agents-api"

describe("createWorkspaceAgentsApi", () => {
  it("sends the organization header with every call", async () => {
    const { fetchImpl, sent } = productFetch(() => json({ agents: [] }))
    await createWorkspaceAgentsApi(fetchImpl).list("org-1")
    expect(sent[0]).toMatchObject({
      method: "GET",
      path: "/v1/workspace-agents",
      organization: "org-1",
    })
  })

  it("creates, patches and deletes by id", async () => {
    const { fetchImpl, sent } = productFetch((request) =>
      request.method === "DELETE" ? json({ deleted: true }) : json({ id: "a1" }),
    )
    const api = createWorkspaceAgentsApi(fetchImpl)
    await api.create("org-1", { name: "Release triage", description: null })
    await api.update("org-1", "a1", { pinned: true })
    await api.remove("org-1", "a1")
    expect(sent[0]?.method).toBe("POST")
    expect(sent[0]?.body).toEqual({ name: "Release triage", description: null })
    expect(sent[1]).toMatchObject({ method: "PATCH", path: "/v1/workspace-agents/a1" })
    expect(sent[1]?.body).toEqual({ pinned: true })
    expect(sent[2]).toMatchObject({ method: "DELETE", path: "/v1/workspace-agents/a1" })
  })

  it("counts runs across pages", async () => {
    const pages = [
      { runs: [{}, {}], nextCursor: "c1" },
      { runs: [{}], nextCursor: null },
    ]
    const { fetchImpl, sent } = productFetch((_request, index) => json(pages[index]))
    const count = await createWorkspaceAgentsApi(fetchImpl).countRuns("org-1", "a1")
    expect(count).toBe(3)
    expect(sent[1]?.path).toBe("/v1/runs")
    expect(sent[1]?.search).toContain("agentId=a1")
    expect(sent[1]?.search).toContain("cursor=c1")
  })

  it("throws the server's message and hint", async () => {
    const { fetchImpl } = productFetch(() =>
      json(
        { error: { code: "FORBIDDEN", message: "Not allowed", hint: "Ask an owner." } },
        { status: 403 },
      ),
    )
    const error = await createWorkspaceAgentsApi(fetchImpl)
      .remove("org-1", "a1")
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect((error as WebError).message).toBe("Not allowed Ask an owner.")
    expect((error as WebError).status).toBe(403)
  })
})
