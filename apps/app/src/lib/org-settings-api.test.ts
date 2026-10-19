// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { createOrgSettingsApi } from "./org-settings-api"

const BASE = "https://app.example.com"

describe("createOrgSettingsApi", () => {
  it("sends the organization id explicitly with an update, and reads the metadata back", async () => {
    const calls: { method: string; path: string; body: unknown }[] = []
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      calls.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      })
      return new Response(
        JSON.stringify({ id: "org-a", name: "Acme", slug: "acme", metadata: { k: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as typeof fetch

    const api = createOrgSettingsApi(BASE, fetchImpl)
    const updated = await api.updateOrganization("org-a", { name: "Acme" })
    expect(updated.metadata).toEqual({ k: 1 })
    expect(calls).toEqual([
      {
        method: "POST",
        path: "/api/auth/organization/update",
        body: { organizationId: "org-a", data: { name: "Acme" } },
      },
    ])
  })

  it("decides a role's rights with the plugin's own role check", () => {
    const api = createOrgSettingsApi(BASE, (async () => new Response("{}")) as typeof fetch)
    expect(api.roleAllows("owner", { organization: ["delete"] })).toBe(true)
    expect(api.roleAllows("admin", { organization: ["delete"] })).toBe(false)
    expect(api.roleAllows("admin", { organization: ["update"] })).toBe(true)
    expect(api.roleAllows("viewer", { organization: ["update"] })).toBe(false)
  })
})
