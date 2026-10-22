// The whole OAuth 2.1 path an MCP client takes, with real tokens from /oauth2/token:
// register (RFC 7591) -> authorize with PKCE + resource (RFC 8707) -> [pick organization] ->
// consent -> token -> /mcp and REST. Tokens are bound to one organization.
import { createHash, randomBytes } from "node:crypto"
import { decodeJwt } from "jose"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { BASE, createTestApp } from "./app.test.helpers"

const REDIRECT = "http://127.0.0.1:33418/callback"
const MCP = `${BASE}/mcp`
const b64url = (b: Buffer) => b.toString("base64url")

describe("OAuth authorization code flow (real tokens)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  beforeAll(async () => {
    t = await createTestApp()
  })
  afterAll(() => t.close())

  const form = (body: Record<string, string>) =>
    t.req("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    })

  async function registerClient() {
    const res = await t.req("/api/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Agent",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
      }),
    })
    return ((await res.json()) as { client_id: string }).client_id
  }

  /** Run the browser part of the flow for a signed-in user, playing the web app's pages. */
  async function authorize(opts: {
    cookie: string
    clientId: string
    scope: string
    resource?: string
    /** Organization switched to on the consent page before accepting. */
    pickOrg?: string
    /** Organization chosen on the select-organization page, if the flow goes there. */
    selectOrg?: string
  }) {
    const verifier = b64url(randomBytes(32))
    const query = new URLSearchParams({
      response_type: "code",
      client_id: opts.clientId,
      redirect_uri: REDIRECT,
      scope: `openid offline_access ${opts.scope}`,
      state: "s1",
      code_challenge: b64url(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
      resource: opts.resource ?? MCP,
    })
    const headers = { cookie: opts.cookie, origin: BASE, "content-type": "application/json" }
    if (opts.pickOrg) {
      // What the consent page's organization switcher does before the user accepts.
      await t.req("/api/auth/organization/set-active", {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: opts.pickOrg }),
      })
    }
    let next = new URL(
      (await t.req(`/api/auth/oauth2/authorize?${query}`, { headers })).headers.get("location") ??
        "",
      BASE,
    )
    if (next.pathname === "/select-organization") {
      if (!opts.selectOrg) throw new Error("asked to select an organization")
      await t.req("/api/auth/organization/set-active", {
        method: "POST",
        headers,
        body: JSON.stringify({ organizationId: opts.selectOrg }),
      })
      const cont = await t.req("/api/auth/oauth2/continue", {
        method: "POST",
        headers,
        body: JSON.stringify({ postLogin: true, oauth_query: next.search.slice(1) }),
      })
      next = new URL(((await cont.json()) as { url: string }).url, BASE)
    }
    if (next.pathname !== "/consent") throw new Error(`unexpected redirect: ${next}`)
    const consent = await t.req("/api/auth/oauth2/consent", {
      method: "POST",
      headers,
      body: JSON.stringify({ accept: true, oauth_query: next.search.slice(1) }),
    })
    const { url } = (await consent.json()) as { url: string }
    const code = new URL(url).searchParams.get("code") ?? ""
    const token = await form({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: opts.clientId,
      code_verifier: verifier,
      resource: opts.resource ?? MCP,
    })
    const body = (await token.json()) as { access_token: string; refresh_token: string }
    if (!body.access_token) throw new Error(JSON.stringify(body))
    return body
  }

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
  const whoami = async (token: string) =>
    (await t.req("/v1/whoami", { headers: bearer(token) })).json() as Promise<{
      organizationId: string
      via: string
      grants: Record<string, string[]>[]
    }>

  it("binds a single-org user's token to that org, usable over MCP and REST", async () => {
    const clientId = await registerClient()
    const { access_token } = await authorize({ cookie: t.other.cookie, clientId, scope: "write" })
    const claims = decodeJwt(access_token)
    // With `openid` the audience also lists the userinfo endpoint.
    expect(claims.aud).toContain(MCP)
    expect(claims).toMatchObject({
      iss: `${BASE}/api/auth`,
      azp: clientId,
      org: t.other.orgId,
    })
    expect(await whoami(access_token)).toMatchObject({
      organizationId: t.other.orgId,
      via: "oauth",
    })
    const client = await t.mcpClient(bearer(access_token))
    try {
      const res = await client.callTool({ name: "create_project", arguments: { name: "Agent" } })
      expect(res.isError ?? false).toBe(false)
    } finally {
      await client.close()
    }
  })

  it("binds the org chosen at consent, with separate grants per organization", async () => {
    // viewer belongs to their personal org (owner) and to the owner's org (viewer role).
    const clientId = await registerClient()
    const inOwnersOrg = await authorize({
      cookie: t.viewer.cookie,
      clientId,
      scope: "write",
      pickOrg: t.owner.orgId,
    })
    const inPersonal = await authorize({
      cookie: t.viewer.cookie,
      clientId,
      scope: "write",
      pickOrg: t.viewer.orgId,
    })
    expect(decodeJwt(inOwnersOrg.access_token).org).toBe(t.owner.orgId)
    expect(decodeJwt(inPersonal.access_token).org).toBe(t.viewer.orgId)
    // Same scope, different roles: viewer in the owner's org, owner in their own.
    expect((await whoami(inOwnersOrg.access_token)).grants).toEqual([
      { project: ["read"], agent: ["read"], run: ["read"] },
    ])
    const create = (token: string) =>
      t.req("/v1/projects", {
        method: "POST",
        headers: { ...bearer(token), "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      })
    expect((await create(inOwnersOrg.access_token)).status).toBe(403)
    expect((await create(inPersonal.access_token)).status).toBe(200)
  })

  it("sends a session without a valid active org to select-organization first", async () => {
    const u = await t.signUp("Picker")
    // Leave the session without an active organization, as after leaving one.
    await t.req("/api/auth/organization/set-active", {
      method: "POST",
      headers: { cookie: u.cookie, origin: BASE, "content-type": "application/json" },
      body: JSON.stringify({ organizationId: null }),
    })
    const clientId = await registerClient()
    await expect(authorize({ cookie: u.cookie, clientId, scope: "read" })).rejects.toThrow(
      /select an organization/,
    )
    const { access_token } = await authorize({
      cookie: u.cookie,
      clientId,
      scope: "read",
      selectOrg: u.orgId,
    })
    expect(decodeJwt(access_token).org).toBe(u.orgId)
  })

  it("keeps the organization across a refresh", async () => {
    const clientId = await registerClient()
    const first = await authorize({
      cookie: t.viewer.cookie,
      clientId,
      scope: "read",
      pickOrg: t.owner.orgId,
    })
    const refreshed = (await (
      await form({
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: clientId,
        resource: MCP,
      })
    ).json()) as { access_token: string }
    expect(decodeJwt(refreshed.access_token).org).toBe(t.owner.orgId)
    expect((await whoami(refreshed.access_token)).organizationId).toBe(t.owner.orgId)
  })

  it("narrows an owner's token to its scopes, including for minting keys", async () => {
    const clientId = await registerClient()
    const { access_token } = await authorize({
      cookie: t.owner.cookie,
      clientId,
      scope: "read",
      pickOrg: t.owner.orgId,
    })
    expect((await whoami(access_token)).grants).toEqual([
      {
        apiKey: ["read"],
        project: ["read"],
        agent: ["read"],
        run: ["read"],
        featureFlag: ["read"],
        entitlements: ["read"],
      },
    ])
    const mint = await t.req("/v1/api-keys", {
      method: "POST",
      headers: { ...bearer(access_token), "content-type": "application/json" },
      body: JSON.stringify({ name: "x", permissions: { project: ["read"] } }),
    })
    expect(mint.status).toBe(403) // read scope has no apiKey:create
  })

  it("lets an admin-scoped token mint keys no wider than its own grants", async () => {
    const clientId = await registerClient()
    const { access_token } = await authorize({
      cookie: t.owner.cookie,
      clientId,
      scope: "read admin",
      pickOrg: t.owner.orgId,
    })
    const mint = (permissions: object) =>
      t.req("/v1/api-keys", {
        method: "POST",
        headers: { ...bearer(access_token), "content-type": "application/json" },
        body: JSON.stringify({ name: "x", permissions }),
      })
    expect((await mint({ project: ["read"] })).status).toBe(200)
    expect((await mint({ project: ["delete"] })).status).toBe(403) // owner can, this token can't
  })

  it("stops accepting a token when the user leaves the organization", async () => {
    const leaver = await t.signUp("Leaver")
    await t.auth.api.addMember({
      body: { organizationId: t.owner.orgId, userId: leaver.userId, role: "member" },
    })
    const clientId = await registerClient()
    const { access_token } = await authorize({
      cookie: leaver.cookie,
      clientId,
      scope: "read",
      pickOrg: t.owner.orgId,
    })
    expect((await t.req("/v1/whoami", { headers: bearer(access_token) })).status).toBe(200)
    await t.auth.api.removeMember({
      headers: new Headers({ cookie: t.owner.cookie }),
      body: { organizationId: t.owner.orgId, memberIdOrEmail: leaver.email },
    })
    expect((await t.req("/v1/whoami", { headers: bearer(access_token) })).status).toBe(401)
  })

  it("advertises offline_access, so an MCP client's grant outlives the web session", async () => {
    // MCP clients commonly request exactly the resource's scopes_supported.
    const prm = (await (await t.req("/.well-known/oauth-protected-resource/mcp")).json()) as {
      scopes_supported: string[]
    }
    expect(prm.scopes_supported).toContain("offline_access")

    const user = await t.signUp("Signs out")
    const clientId = await registerClient()
    const scope = prm.scopes_supported.filter((s) => s !== "offline_access").join(" ")
    const tokens = await authorize({ cookie: user.cookie, clientId, scope })
    expect(tokens.refresh_token).toBeTruthy()

    const signOut = await t.req("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie: user.cookie, origin: BASE, "content-type": "application/json" },
      body: "{}",
    })
    expect(signOut.status).toBe(200)

    // The access token still works, and the refresh token (offline_access) still renews it.
    expect((await t.req("/v1/whoami", { headers: bearer(tokens.access_token) })).status).toBe(200)
    const renewed = await form({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      resource: MCP,
    })
    expect(renewed.status).toBe(200)
  })

  it("refuses to authorize a resource this API does not serve", async () => {
    const clientId = await registerClient()
    await expect(
      authorize({
        cookie: t.other.cookie,
        clientId,
        scope: "read",
        resource: "https://other.example.com/mcp",
      }),
    ).rejects.toThrow(/unexpected redirect/)
  })
})
