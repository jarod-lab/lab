import { describe, expect, it } from "vitest"

import { createOrgSecurityApi } from "./org-security-api"
import { EMPTY_SSO_VALUES } from "./org-security"

const BASE = "https://app.example.com"

/** A fetch stub that answers each path from a table, and records each request. */
function stubFetch(answers: Record<string, { status: number; body: unknown }>) {
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    calls.push({
      method: init?.method ?? "GET",
      path: url.pathname,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    })
    const answer = answers[url.pathname] ?? { status: 200, body: null }
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
  return { calls, fetchImpl }
}

describe("createOrgSecurityApi", () => {
  it("lists only the providers that belong to this organization", async () => {
    const { calls, fetchImpl } = stubFetch({
      "/api/auth/sso/providers": {
        status: 200,
        body: {
          providers: [
            {
              providerId: "a",
              type: "oidc",
              issuer: "https://x",
              domain: "acme.com",
              organizationId: "org-a",
              domainVerified: false,
            },
            {
              providerId: "b",
              type: "saml",
              issuer: "https://y",
              domain: "other.com",
              organizationId: "org-b",
              domainVerified: false,
            },
            {
              providerId: "c",
              type: "oidc",
              issuer: "https://z",
              domain: "solo.dev",
              organizationId: null,
              domainVerified: false,
            },
          ],
        },
      },
    })
    const api = createOrgSecurityApi(BASE, fetchImpl)
    const providers = await api.listSsoProviders("org-a")
    expect(providers.map((p) => p.providerId)).toEqual(["a"])
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/auth/sso/providers" })
  })

  it("registers a provider with the org and the plugin's body", async () => {
    const { calls, fetchImpl } = stubFetch({ "/api/auth/sso/register": { status: 200, body: {} } })
    const api = createOrgSecurityApi(BASE, fetchImpl)
    await api.registerSsoProvider("org-a", "acme-com-1", {
      ...EMPTY_SSO_VALUES,
      domain: "acme.com",
      issuer: "https://login.acme.com",
      clientId: "abc",
      clientSecret: "shh",
    })
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/api/auth/sso/register",
      body: { providerId: "acme-com-1", organizationId: "org-a", domain: "acme.com" },
    })
  })

  it("deletes a provider by id, naming the organization", async () => {
    const { calls, fetchImpl } = stubFetch({
      "/api/auth/sso/delete-provider": { status: 200, body: { success: true } },
    })
    await createOrgSecurityApi(BASE, fetchImpl).deleteSsoProvider("org-a", "acme-com-1")
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/auth/sso/delete-provider",
      body: { organizationId: "org-a", providerId: "acme-com-1" },
    })
  })

  it("mints a SCIM token for the organization and returns it", async () => {
    const { calls, fetchImpl } = stubFetch({
      "/api/auth/scim/generate-token": {
        status: 200,
        body: { token: "scim_tok", connectionId: "c1", expiresInDays: 365 },
      },
    })
    const token = await createOrgSecurityApi(BASE, fetchImpl).generateScimToken("org-a")
    expect(token).toEqual({ token: "scim_tok", expiresInDays: 365 })
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/auth/scim/generate-token",
      body: { organizationId: "org-a" },
    })
  })

  it("throws the server's message when a call is refused", async () => {
    const { fetchImpl } = stubFetch({
      "/api/auth/scim/generate-token": {
        status: 403,
        body: {
          code: "ORGANIZATION_OWNER_REQUIRED",
          message: "Only an organization owner can generate a SCIM token",
        },
      },
    })
    await expect(createOrgSecurityApi(BASE, fetchImpl).generateScimToken("org-a")).rejects.toThrow(
      "Only an organization owner can generate a SCIM token",
    )
  })
})
