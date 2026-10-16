// The owner-only endpoints (SSO providers, SCIM tokens) and the magic-link second factor, called through the
// router so the hooks run, as they do over HTTP. Real Postgres via PGlite.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { BASE, createTestAuth } from "./auth.test.helpers"

describe("owner-only SSO and SCIM endpoints (router, real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  let orgId: string
  let owner: { userId: string; cookie: string }
  let admin: { cookie: string; userId: string }
  let member: { cookie: string; userId: string }
  let outsider: { cookie: string; userId: string }

  beforeAll(async () => {
    t = await createTestAuth()
    const o = await t.signUp("Owner")
    orgId = o.orgId
    owner = o
    admin = await t.signUp("Admin")
    member = await t.signUp("Member")
    outsider = await t.signUp("Outsider")
    await t.addMember(orgId, admin.userId, "admin")
    await t.addMember(orgId, member.userId, "member")
  })
  afterAll(() => t.close())

  const post = (path: string, cookie: string, body: unknown) =>
    t.auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: BASE },
        body: JSON.stringify(body),
      }),
    )

  const provider = (providerId: string, organizationId?: string) => ({
    providerId,
    issuer: "https://idp.acme.test",
    domain: "acme.test",
    ...(organizationId ? { organizationId } : {}),
    oidcConfig: {
      clientId: "client",
      clientSecret: "secret", // gitleaks:allow
      authorizationEndpoint: "https://idp.acme.test/authorize",
      tokenEndpoint: "https://idp.acme.test/token",
      jwksEndpoint: "https://idp.acme.test/jwks",
      skipDiscovery: true,
    },
  })

  it("registers an SSO provider for the owner only, and refuses one with no organization", async () => {
    expect((await post("/sso/register", owner.cookie, provider("p-owner", orgId))).status).toBe(200)
    const noOrg = await post("/sso/register", owner.cookie, provider("p-none"))
    expect(noOrg.status).toBe(403)
    expect(await noOrg.json()).toMatchObject({ code: "ORGANIZATION_OWNER_REQUIRED" })
    const asAdmin = await post("/sso/register", admin.cookie, provider("p-admin", orgId))
    expect(asAdmin.status).toBe(403)
    const asMember = await post("/sso/register", member.cookie, provider("p-member", orgId))
    expect(asMember.status).toBe(403)
  })

  it("refuses to change or delete a provider of an organization the caller is not in", async () => {
    // The guard looks the provider up and checks the caller's role in its own organization.
    const updated = await post("/sso/update-provider", outsider.cookie, {
      providerId: "p-owner",
      issuer: "https://evil.test",
    })
    expect(updated.status).toBe(403)
    const deleted = await post("/sso/delete-provider", outsider.cookie, { providerId: "p-owner" })
    expect(deleted.status).toBe(403)
    expect(await deleted.json()).toMatchObject({ code: "ORGANIZATION_OWNER_REQUIRED" })
  })

  it("refuses an unknown provider to a signed-out caller, with the sign-in code", async () => {
    const res = await t.auth.handler(
      new Request(`${BASE}/api/auth/sso/delete-provider`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ providerId: "p-owner" }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it("mints a SCIM token for the owner, and refuses the admin, the member and a missing organization", async () => {
    const minted = await post("/scim/generate-token", owner.cookie, { organizationId: orgId })
    expect(minted.status).toBe(200)
    const body = (await minted.json()) as {
      token: string
      connectionId: string
      expiresInDays: number
    }
    expect(body.token.length).toBeGreaterThan(20)
    expect(body.connectionId.length).toBeGreaterThan(0)
    expect(body.expiresInDays).toBe(365)

    const asAdmin = await post("/scim/generate-token", admin.cookie, { organizationId: orgId })
    expect(asAdmin.status).toBe(403)
    const asMember = await post("/scim/generate-token", member.cookie, { organizationId: orgId })
    expect(asMember.status).toBe(403)
    const noOrg = await post("/scim/generate-token", owner.cookie, {})
    expect(noOrg.status).toBe(400)
    expect(await noOrg.json()).toMatchObject({ code: "ORGANIZATION_REQUIRED" })
  })

  it("refuses a SCIM token without a session", async () => {
    const res = await t.auth.handler(
      new Request(`${BASE}/api/auth/scim/generate-token`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ organizationId: orgId }),
      }),
    )
    expect(res.status).toBe(401)
  })
})

describe("magic link for a user with two-factor on (router, real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  beforeAll(async () => {
    t = await createTestAuth()
  })
  afterAll(() => t.close())

  it("opens the second-factor challenge instead of a session, and keeps the callback", async () => {
    const user = await t.signUp("Second factor")
    await (await t.auth.$context).adapter.updateMany({
      model: "user",
      where: [{ field: "id", value: user.userId }],
      update: { twoFactorEnabled: true },
    })
    const sent = await t.auth.handler(
      new Request(`${BASE}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({ email: user.email, callbackURL: "/welcome" }),
      }),
    )
    expect(sent.status).toBe(200)
    const mail = t.outbox.filter((m) => m.to === user.email).at(-1)
    expect(mail?.link).toContain("/api/auth/magic-link/verify?token=")

    const landing = await t.auth.handler(
      new Request(mail?.link ?? "", { headers: { origin: BASE } }),
    )
    expect(landing.status).toBe(302)
    const next = new URL(landing.headers.get("location") ?? "")
    expect(next.pathname).toBe("/two-factor")
    expect(next.searchParams.get("callbackURL")).toBe("/welcome")
    expect(landing.headers.getSetCookie().join(";")).toContain("two_factor")
    // The session the link created was taken back: no session cookie in the browser.
    const session = await t.auth.api.getSession({ headers: new Headers({ cookie: user.cookie }) })
    expect(session).toBeNull()
  })
})
