import { allowed } from "@starter/api"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AUDIENCE, BASE, createTestAuth } from "./auth.test.helpers"
import { resolvePrincipal } from "./principal"

// Real tokens from /oauth2/token are covered end to end in apps/api (oauth-flow.test.ts).
const ISSUER = `${BASE}/api/auth`

describe("resolvePrincipal (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  let owner: Awaited<ReturnType<typeof t.signUp>>
  let viewer: Awaited<ReturnType<typeof t.signUp>>

  beforeAll(async () => {
    t = await createTestAuth()
    owner = await t.signUp("Owner")
    viewer = await t.signUp("Viewer")
    await t.addMember(owner.orgId, viewer.userId, "viewer")
  })
  afterAll(() => t.close())

  const resolve = (headers: Record<string, string>) =>
    resolvePrincipal(t.auth, new Headers(headers), { audience: AUDIENCE })
  const orgKey = (permissions: Record<string, string[]>, extra: object = {}) =>
    t.auth.api.createApiKey({
      body: { organizationId: owner.orgId, userId: owner.userId, permissions, ...extra },
    })
  const sign = async (payload: Record<string, unknown>, issuer = ISSUER) =>
    (await t.auth.api.signJWT({ body: { payload, overrideOptions: { jwt: { issuer } } } })).token

  it("returns null with no credentials", async () => {
    expect(await resolve({})).toBeNull()
  })

  describe("sessions", () => {
    it("act in the active organization with the member's role", async () => {
      const p = await resolve({ cookie: owner.cookie })
      expect(p).toMatchObject({
        organizationId: owner.orgId,
        actor: { type: "user", userId: owner.userId },
        via: "session",
      })
      expect(allowed(p?.grants ?? [], { organization: ["delete"] })).toBe(true)
    })

    it("follow a switch of active organization, with that org's role", async () => {
      await t.setActive(viewer.cookie, owner.orgId)
      const p = await resolve({ cookie: viewer.cookie })
      expect(p?.organizationId).toBe(owner.orgId)
      expect(allowed(p?.grants ?? [], { project: ["read"] })).toBe(true)
      expect(allowed(p?.grants ?? [], { project: ["create"] })).toBe(false)
    })

    it("stop working in an org the user was removed from", async () => {
      const u = await t.signUp("Leaver")
      await t.addMember(owner.orgId, u.userId, "member")
      await t.setActive(u.cookie, owner.orgId)
      expect(await resolve({ cookie: u.cookie })).not.toBeNull()
      await t.auth.api.removeMember({
        headers: new Headers({ cookie: owner.cookie }),
        body: { organizationId: owner.orgId, memberIdOrEmail: u.email },
      })
      expect(await resolve({ cookie: u.cookie })).toBeNull()
    })
  })

  describe("organization API keys", () => {
    it("act for the org with exactly the permissions they were given", async () => {
      const key = await orgKey({ project: ["read"] })
      expect(key.key.startsWith("sk_")).toBe(true)
      const expected = {
        organizationId: owner.orgId,
        actor: { type: "apiKey", keyId: key.id },
        via: "api-key",
        grants: [{ project: ["read"] }],
        clientId: key.id,
      }
      expect(await resolve({ "x-api-key": key.key })).toEqual(expected)
      expect(await resolve({ authorization: `Bearer ${key.key}` })).toEqual(expected)
    })

    it("grant nothing by default", async () => {
      const key = await t.auth.api.createApiKey({
        body: { organizationId: owner.orgId, userId: owner.userId },
      })
      expect((await resolve({ "x-api-key": key.key }))?.grants).toEqual([])
    })

    it("can't be created by a member without apiKey:create", async () => {
      await expect(
        t.auth.api.createApiKey({ body: { organizationId: owner.orgId, userId: viewer.userId } }),
      ).rejects.toMatchObject({ statusCode: 403 })
    })

    it("stop working when their organization is deleted", async () => {
      const u = await t.signUp("Temp")
      const key = await t.auth.api.createApiKey({
        body: { organizationId: u.orgId, userId: u.userId, permissions: { project: ["read"] } },
      })
      expect(await resolve({ "x-api-key": key.key })).not.toBeNull()
      await t.auth.api.deleteOrganization({
        headers: new Headers({ cookie: u.cookie }),
        body: { organizationId: u.orgId },
      })
      expect(await resolve({ "x-api-key": key.key })).toBeNull()
    })

    it("report over-limit as RATE_LIMITED, not as unauthenticated", async () => {
      const key = await orgKey(
        { project: ["read"] },
        { rateLimitEnabled: true, rateLimitTimeWindow: 60_000, rateLimitMax: 1 },
      )
      expect(await resolve({ "x-api-key": key.key })).not.toBeNull()
      await expect(resolve({ "x-api-key": key.key })).rejects.toMatchObject({
        code: "RATE_LIMITED",
        status: 429,
      })
    })

    it("reject an unknown key", async () => {
      expect(await resolve({ "x-api-key": "sk_not-a-real-key" })).toBeNull()
    })
  })

  describe("OAuth access tokens", () => {
    const claims = () => ({ sub: viewer.userId, aud: AUDIENCE, azp: "client-1", org: owner.orgId })

    it("act in the token's org with role ∩ scopes", async () => {
      const token = await sign({ ...claims(), scope: "openid write" })
      const p = await resolve({ authorization: `Bearer ${token}` })
      expect(p).toMatchObject({ organizationId: owner.orgId, via: "oauth", clientId: "client-1" })
      // viewer role allows project:read only; the write scope can't raise that.
      expect(p?.grants).toEqual([{ project: ["read"] }])
    })

    it("accept client_id when azp is absent", async () => {
      const { azp: _, ...rest } = claims()
      const token = await sign({ ...rest, client_id: "client-2", scope: "read" })
      expect((await resolve({ authorization: `Bearer ${token}` }))?.clientId).toBe("client-2")
    })

    it("reject wrong audience or issuer, missing client, org or subject, non-members, garbage", async () => {
      const { azp: _a, ...noClient } = claims()
      const { org: _o, ...noOrg } = claims()
      const { sub: _s, ...noSub } = claims()
      const stranger = await t.signUp("Stranger")
      const tokens = [
        await sign({ ...claims(), aud: "https://elsewhere.example.com" }),
        await sign(claims(), BASE),
        await sign(noClient),
        await sign(noOrg),
        await sign(noSub),
        await sign({ ...claims(), sub: stranger.userId }),
        "not.a.jwt",
      ]
      for (const token of tokens) {
        expect(await resolve({ authorization: `Bearer ${token}` })).toBeNull()
      }
    })
  })

  it("does not hand out session JWTs that could pass as access tokens", async () => {
    const res = await t.auth.api.getSession({
      headers: new Headers({ cookie: owner.cookie }),
      asResponse: true,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("set-auth-jwt")).toBeNull()
  })
})
