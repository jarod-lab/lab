// Revoking a connected agent (revoke_agent_access) cuts off its OAuth access tokens at once, not at
// expiry. Tokens are JWTs with no row, so resolvePrincipal checks for a live grant on every request.
// Real tokens from /oauth2/token, over HTTP, for both the authorization code and the device grant.
import { createHash, randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { BASE, createTestApp } from "./app.test.helpers"

const MCP = `${BASE}/mcp`
const REDIRECT = "http://127.0.0.1:33418/callback"
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
const b64url = (b: Buffer) => b.toString("base64url")

describe("revoking a connected agent cuts off its tokens", () => {
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

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
  const whoami = (token: string) => t.req("/v1/whoami", { headers: bearer(token) })

  /** Revoke a connected agent, as the signed-in person's browser (or an agent) would. */
  const revoke = (cookie: string, clientId: string) =>
    t.req(
      `/v1/agents/${encodeURIComponent(`client_${clientId}`)}`,
      t.as(cookie, { method: "DELETE" }),
    )

  async function registerClient(body: Record<string, unknown>) {
    const res = await t.req("/api/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token_endpoint_auth_method: "none", ...body }),
    })
    expect(res.status).toBe(201)
    return ((await res.json()) as { client_id: string }).client_id
  }

  /** The authorization code grant as a signed-in person's browser runs it, PKCE and resource. */
  async function authorizationCodeToken(cookie: string, clientId: string, offline: boolean) {
    const verifier = b64url(randomBytes(32))
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      scope: `openid ${offline ? "offline_access " : ""}write`,
      state: "s1",
      code_challenge: b64url(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
      resource: MCP,
    })
    const headers = { cookie, origin: BASE, "content-type": "application/json" }
    const authorized = await t.req(`/api/auth/oauth2/authorize?${query}`, { headers })
    let next = new URL(authorized.headers.get("location") ?? "", BASE)
    if (next.pathname === "/consent") {
      // First grant from this client: the consent page accepts it.
      const consent = await t.req("/api/auth/oauth2/consent", {
        method: "POST",
        headers,
        body: JSON.stringify({ accept: true, oauth_query: next.search.slice(1) }),
      })
      next = new URL(((await consent.json()) as { url: string }).url)
    }
    const code = next.searchParams.get("code") ?? ""
    if (!code) throw new Error(`no authorization code, got ${next}`)
    const res = await form({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource: MCP,
    })
    const tokens = (await res.json()) as { access_token?: string; refresh_token?: string }
    if (!tokens.access_token) throw new Error(JSON.stringify(tokens))
    return { access_token: tokens.access_token, refresh_token: tokens.refresh_token }
  }

  /** The device grant: a public client asks for a code, the person approves, the client polls. */
  async function deviceToken(cookie: string, clientId: string) {
    const code = await t.req("/api/auth/device/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        scope: "read write offline_access",
        resource: MCP,
      }),
    })
    const device = (await code.json()) as { device_code: string; user_code: string }
    const claim = await t.req(
      `/api/auth/device?user_code=${encodeURIComponent(device.user_code)}`,
      t.as(cookie, { method: "GET" }),
    )
    expect(claim.status).toBe(200)
    const approved = await t.req(
      "/api/auth/device/approve",
      t.as(cookie, { method: "POST", body: JSON.stringify({ userCode: device.user_code }) }),
    )
    expect(approved.status).toBe(200)
    const res = await form({
      grant_type: DEVICE_GRANT,
      device_code: device.device_code,
      client_id: clientId,
    })
    const tokens = (await res.json()) as { access_token?: string; refresh_token?: string }
    if (!tokens.access_token) throw new Error(JSON.stringify(tokens))
    return { access_token: tokens.access_token, refresh_token: tokens.refresh_token }
  }

  const authCodeClient = () =>
    registerClient({
      client_name: "Editor",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
    })
  const deviceClient = () =>
    registerClient({
      client_name: "Device CLI",
      grant_types: [DEVICE_GRANT, "refresh_token"],
    })

  it("an authorization code token works, is cut off by revoking the agent, and is refused", async () => {
    const clientId = await authCodeClient()
    const { access_token } = await authorizationCodeToken(t.owner.cookie, clientId, true)
    expect((await whoami(access_token)).status).toBe(200)

    const revoked = await revoke(t.owner.cookie, clientId)
    expect(revoked.status).toBe(200)
    expect((await whoami(access_token)).status).toBe(401)
  })

  it("a code grant without offline_access (no refresh token) is cut off the same way", async () => {
    const clientId = await authCodeClient()
    const { access_token, refresh_token } = await authorizationCodeToken(
      t.owner.cookie,
      clientId,
      false,
    )
    expect(refresh_token).toBeUndefined()
    expect((await whoami(access_token)).status).toBe(200)

    expect((await revoke(t.owner.cookie, clientId)).status).toBe(200)
    expect((await whoami(access_token)).status).toBe(401)
  })

  it("a device-grant token works, is cut off by revoking the agent, and its refresh is refused", async () => {
    const clientId = await deviceClient()
    const { access_token, refresh_token } = await deviceToken(t.owner.cookie, clientId)
    expect((await whoami(access_token)).status).toBe(200)

    expect((await revoke(t.owner.cookie, clientId)).status).toBe(200)
    expect((await whoami(access_token)).status).toBe(401)
    const refreshed = await form({
      grant_type: "refresh_token",
      refresh_token: refresh_token ?? "",
      client_id: clientId,
    })
    expect(refreshed.status).toBe(400)
  })

  it("a token issued before the revocation stays dead after a new device grant", async () => {
    const clientId = await deviceClient()
    const before = await deviceToken(t.owner.cookie, clientId)
    expect((await whoami(before.access_token)).status).toBe(200)

    expect((await revoke(t.owner.cookie, clientId)).status).toBe(200)
    // Tokens are stamped to the second: a grant in the same second as the revoke is also refused.
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const after = await deviceToken(t.owner.cookie, clientId)
    expect((await whoami(after.access_token)).status).toBe(200)
    expect((await whoami(before.access_token)).status).toBe(401)
  })

  it("another organization's revoke leaves this organization's tokens working", async () => {
    // The same client holds a grant in the owner's org and in another user's personal org.
    const clientId = await authCodeClient()
    const ours = await authorizationCodeToken(t.owner.cookie, clientId, true)
    const theirs = await authorizationCodeToken(t.other.cookie, clientId, true)
    expect((await whoami(ours.access_token)).status).toBe(200)

    // Revoking from the other org touches only that org's grant.
    expect((await revoke(t.other.cookie, clientId)).status).toBe(200)
    expect((await whoami(theirs.access_token)).status).toBe(401)
    expect((await whoami(ours.access_token)).status).toBe(200)

    // And the other org has nothing left to revoke for this client.
    expect((await revoke(t.other.cookie, clientId)).status).toBe(404)
  })

  it("an API key over its rate limit gets 429 with Retry-After", async () => {
    const { key } = await t.auth.api.createApiKey({
      body: {
        organizationId: t.owner.orgId,
        userId: t.owner.userId,
        permissions: { project: ["read"] },
        rateLimitEnabled: true,
        rateLimitTimeWindow: 60_000,
        rateLimitMax: 1,
      },
    })
    const first = await t.req("/v1/whoami", { headers: { "x-api-key": key } })
    expect(first.status).toBe(200)

    const limited = await t.req("/v1/whoami", { headers: { "x-api-key": key } })
    expect(limited.status).toBe(429)
    const retryAfter = Number(limited.headers.get("retry-after"))
    // The window is 60s and the second request came right after the first: about the full minute.
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThanOrEqual(55)
    expect(retryAfter).toBeLessThanOrEqual(60)
    expect(await limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } })
  })
})
