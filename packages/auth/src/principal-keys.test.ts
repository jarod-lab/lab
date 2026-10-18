// The signing-key cache in principal.ts: reused for JWKS_TTL_MS, and refetched once when a token
// names a key the cache doesn't hold (a rotation).
import { exportJWK, generateKeyPair, type JSONWebKeySet, SignJWT } from "jose"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { AUDIENCE, BASE, createTestAuth } from "./auth.test.helpers"
import { JWKS_TTL_MS, resolvePrincipal } from "./principal"

const ISSUER = `${BASE}/api/auth`

describe("signing-key cache (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  let owner: Awaited<ReturnType<typeof t.signUp>>
  let viewer: Awaited<ReturnType<typeof t.signUp>>
  // Kept before any spy replaces it, so a mocked getJwks can call the real one.
  let realGetJwks: () => Promise<JSONWebKeySet>

  beforeAll(async () => {
    t = await createTestAuth()
    const real = t.auth.api.getJwks
    realGetJwks = () => real.call(t.auth.api) as Promise<JSONWebKeySet>
    owner = await t.signUp("Owner")
    viewer = await t.signUp("Viewer")
    await t.addMember(owner.orgId, viewer.userId, "viewer")
    const adapter = (await t.auth.$context).adapter
    const now = new Date()
    await adapter.create({
      model: "oauthClient",
      data: { clientId: "client-1", redirectUris: [], createdAt: now, updatedAt: now },
    })
    await adapter.create({
      model: "oauthConsent",
      data: {
        clientId: "client-1",
        userId: viewer.userId,
        referenceId: owner.orgId,
        scopes: ["read"],
        createdAt: new Date(Math.floor(now.getTime() / 1000) * 1000 - 1000),
        updatedAt: now,
      },
    })
  })
  afterAll(() => t.close())
  afterEach(() => vi.restoreAllMocks())

  const resolve = (token: string) =>
    resolvePrincipal(t.auth, new Headers({ authorization: `Bearer ${token}` }), {
      audience: AUDIENCE,
    })
  const claims = () => ({
    sub: viewer.userId,
    aud: AUDIENCE,
    azp: "client-1",
    org: owner.orgId,
    scope: "read",
    iat: Math.floor(Date.now() / 1000),
  })
  const signWithServerKey = async () =>
    (
      await t.auth.api.signJWT({
        body: { payload: claims(), overrideOptions: { jwt: { issuer: ISSUER } } },
      })
    ).token

  it("fetches the signing keys once, then reuses them", async () => {
    const jwks = vi.spyOn(t.auth.api, "getJwks")
    const token = await signWithServerKey()
    expect((await resolve(token))?.organizationId).toBe(owner.orgId)
    expect(jwks).toHaveBeenCalledTimes(1)
    expect((await resolve(token))?.organizationId).toBe(owner.orgId)
    expect(jwks).toHaveBeenCalledTimes(1)
  })

  it("fetches again once the cached keys are older than the TTL", async () => {
    const jwks = vi.spyOn(t.auth.api, "getJwks")
    const token = await signWithServerKey()
    await resolve(token)
    const cached = jwks.mock.calls.length
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + JWKS_TTL_MS + 1)
    await resolve(token)
    expect(jwks.mock.calls.length).toBe(cached + 1)
  })

  it("refetches once when a token's key is not in the cache, then refuses an unknown key", async () => {
    const jwks = vi.spyOn(t.auth.api, "getJwks")
    expect(await resolve(await signWithServerKey())).not.toBeNull()
    const before = jwks.mock.calls.length

    // A key the server gained after its keys were cached: the token's kid is unknown until refetched.
    const rotated = await generateKeyPair("EdDSA", { crv: "Ed25519" })
    const rotatedJwk = { ...(await exportJWK(rotated.publicKey)), kid: "rotated-1", alg: "EdDSA" }
    vi.spyOn(t.auth.api, "getJwks").mockImplementation(async () => {
      const real = await realGetJwks()
      return { keys: [...real.keys, rotatedJwk] }
    })
    const signed = await new SignJWT(claims())
      .setProtectedHeader({ alg: "EdDSA", kid: "rotated-1" })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .sign(rotated.privateKey)
    expect((await resolve(signed))?.organizationId).toBe(owner.orgId)
    expect(jwks.mock.calls.length).toBe(before + 1)

    // A key nobody holds is refused after one refetch, not a loop.
    const stranger = await generateKeyPair("EdDSA", { crv: "Ed25519" })
    const unknown = await new SignJWT(claims())
      .setProtectedHeader({ alg: "EdDSA", kid: "nobody" })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .sign(stranger.privateKey)
    expect(await resolve(unknown)).toBeNull()
    expect(jwks.mock.calls.length).toBe(before + 2)
  })
})
