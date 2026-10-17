// @vitest-environment jsdom
import { describe, expect, it } from "vitest"

import { createWebAuth, WebError } from "./web-auth"

const BASE = "https://app.example.com"

interface Call {
  method: string
  path: string
  search: string
  body: unknown
}

/**
 * A fake server behind better-auth's client. `routes` maps `METHOD /path` to a status and body; an
 * unknown route is a 404 so a wrong path fails the test loudly.
 */
function fakeServer(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method ?? "GET").toUpperCase()
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    calls.push({ method, path: url.pathname, search: url.search, body })
    const route = routes[`${method} ${url.pathname}`]
    const status = route?.status ?? (route ? 200 : 404)
    const payload = route ? route.body : { message: "not found" }
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe("createWebAuth", () => {
  it("answers a password sign-in that needs a second factor with the two-factor page", async () => {
    const { fetchImpl } = fakeServer({
      "POST /api/auth/sign-in/email": {
        body: { twoFactorRedirect: true, twoFactorMethods: ["totp"] },
      },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    const url = await auth.signIn({ email: "ada@example.com", password: "pw-123456789" }) // gitleaks:allow
    expect(url).toBe("/two-factor" + window.location.search)
  })

  it("reads the session and maps the active organization", async () => {
    const { fetchImpl, calls } = fakeServer({
      "GET /api/auth/get-session": {
        body: {
          user: { id: "u1", email: "ada@example.com", name: "Ada", image: null },
          session: { id: "s1", activeOrganizationId: "org-b" },
        },
      },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.getSession()).resolves.toEqual({
      user: { id: "u1", email: "ada@example.com", name: "Ada" },
      activeOrganizationId: "org-b",
      impersonatedBy: null,
    })
    expect(calls[0]?.path).toBe("/api/auth/get-session")
  })

  it("reports who is impersonating the session, if anyone", async () => {
    const { fetchImpl } = fakeServer({
      "GET /api/auth/get-session": {
        body: {
          user: { id: "u1", email: "ada@example.com", name: "Ada", image: null },
          session: { id: "s1", activeOrganizationId: null, impersonatedBy: "admin-1" },
        },
      },
    })
    await expect(createWebAuth(BASE, fetchImpl).getSession()).resolves.toMatchObject({
      impersonatedBy: "admin-1",
    })
  })

  it("returns null when there is no session", async () => {
    const { fetchImpl } = fakeServer({ "GET /api/auth/get-session": { body: null } })
    await expect(createWebAuth(BASE, fetchImpl).getSession()).resolves.toBeNull()
  })

  it("returns the URL to resume an OAuth flow after sign-in, and undefined without one", async () => {
    const { fetchImpl, calls } = fakeServer({
      "POST /api/auth/sign-in/email": { body: { redirect: false, token: "t", user: {} } },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.signIn({ email: "ada@example.com", password: "pw-12345678" })).resolves.toBe(
      undefined,
    )
    expect(calls[0]?.body).toMatchObject({ email: "ada@example.com" })
  })

  it("passes sign-up through with the name", async () => {
    const { fetchImpl, calls } = fakeServer({
      "POST /api/auth/sign-up/email": {
        body: { url: "https://app.example.com/consent", redirect: true, user: {} },
      },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(
      auth.signUp({ name: "Ada", email: "ada@example.com", password: "pw-12345678" }),
    ).resolves.toBe("https://app.example.com/consent")
    expect(calls[0]?.body).toMatchObject({ name: "Ada", email: "ada@example.com" })
  })

  it("turns a refused call into a WebError with the server's message", async () => {
    const { fetchImpl } = fakeServer({
      "POST /api/auth/sign-in/email": {
        status: 401,
        body: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
      },
    })
    const error = await createWebAuth(BASE, fetchImpl)
      .signIn({ email: "ada@example.com", password: "wrong" })
      .catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WebError)
    expect(error).toMatchObject({ message: "Invalid email or password", status: 401 })
  })

  it("falls back to a fixed message when the server gives none", async () => {
    const { fetchImpl } = fakeServer({
      "GET /api/auth/organization/list": { status: 500, body: {} },
    })
    await expect(createWebAuth(BASE, fetchImpl).listOrganizations()).rejects.toThrow(
      "Could not load organizations",
    )
  })

  it("lists organizations and sets the active one", async () => {
    const { fetchImpl, calls } = fakeServer({
      "GET /api/auth/organization/list": {
        body: [
          { id: "org-a", name: "Analytical Ltd", slug: "a" },
          { id: "org-b", name: "Babbage Labs", slug: "b" },
        ],
      },
      "POST /api/auth/organization/set-active": { body: { id: "org-b" } },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.listOrganizations()).resolves.toEqual([
      { id: "org-a", name: "Analytical Ltd", slug: "a" },
      { id: "org-b", name: "Babbage Labs", slug: "b" },
    ])
    await auth.setActiveOrganization("org-b")
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      path: "/api/auth/organization/set-active",
      body: { organizationId: "org-b" },
    })
  })

  it("reads the OAuth client's public name, or null when it has none", async () => {
    const { fetchImpl, calls } = fakeServer({
      "GET /api/auth/oauth2/public-client": { body: { client_name: "Claude Code" } },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.getClientName("client-1")).resolves.toBe("Claude Code")
    expect(calls[0]?.search).toBe("?client_id=client-1")

    const bare = fakeServer({ "GET /api/auth/oauth2/public-client": { body: {} } })
    await expect(createWebAuth(BASE, bare.fetchImpl).getClientName("client-2")).resolves.toBeNull()
  })

  it("records consent with accept and returns the URL to continue to", async () => {
    const { fetchImpl, calls } = fakeServer({
      "POST /api/auth/oauth2/consent": { body: { redirect: true, url: "https://cb.example/x" } },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.consent(true)).resolves.toBe("https://cb.example/x")
    expect(calls[0]?.body).toEqual({ accept: true })
  })

  it("falls back to redirect_uri when continue answers with it", async () => {
    const { fetchImpl, calls } = fakeServer({
      "POST /api/auth/oauth2/continue": { body: { redirect_uri: "https://cb.example/y" } },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.continueOAuth()).resolves.toBe("https://cb.example/y")
    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/api/auth/oauth2/continue",
      body: { postLogin: true },
    })
  })

  it("returns undefined when a consent answer has no URL", async () => {
    const { fetchImpl } = fakeServer({ "POST /api/auth/oauth2/consent": { body: {} } })
    await expect(createWebAuth(BASE, fetchImpl).consent(false)).resolves.toBeUndefined()
  })

  it("loads and accepts an invitation", async () => {
    const { fetchImpl, calls } = fakeServer({
      "GET /api/auth/organization/get-invitation": {
        body: {
          id: "inv-1",
          organizationName: "Babbage Labs",
          email: "ada@example.com",
          role: "member",
          status: "pending",
          organizationId: "org-b",
        },
      },
      "POST /api/auth/organization/accept-invitation": { body: { invitation: {} } },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.getInvitation("inv-1")).resolves.toEqual({
      id: "inv-1",
      organizationName: "Babbage Labs",
      email: "ada@example.com",
      role: "member",
      status: "pending",
    })
    expect(calls[0]?.search).toBe("?id=inv-1")
    await auth.acceptInvitation("inv-1")
    expect(calls.at(-1)).toMatchObject({ body: { invitationId: "inv-1" } })
  })

  it("resets the password with the token", async () => {
    const { fetchImpl, calls } = fakeServer({
      "POST /api/auth/reset-password": { body: { status: true } },
    })
    await createWebAuth(BASE, fetchImpl).resetPassword({ token: "tok", newPassword: "new-pass-1" })
    expect(calls[0]?.body).toEqual({ token: "tok", newPassword: "new-pass-1" })
  })

  it("looks up, approves and denies a device code", async () => {
    const { fetchImpl, calls } = fakeServer({
      "GET /api/auth/device": {
        body: { status: "pending", user_code: "ABCD-1234", client_id: "client-1", scope: "read" },
      },
      "POST /api/auth/device/approve": { body: { success: true } },
      "POST /api/auth/device/deny": { body: { success: true } },
    })
    const auth = createWebAuth(BASE, fetchImpl)
    await expect(auth.device.lookup("ABCD-1234")).resolves.toEqual({
      status: "pending",
      clientId: "client-1",
      scope: "read",
    })
    expect(calls[0]?.search).toBe("?user_code=ABCD-1234")
    await auth.device.approve("ABCD-1234")
    await auth.device.deny("ABCD-1234")
    expect(calls.slice(-2)).toMatchObject([
      { path: "/api/auth/device/approve", body: { userCode: "ABCD-1234" } },
      { path: "/api/auth/device/deny", body: { userCode: "ABCD-1234" } },
    ])
  })

  it("shows the OAuth error description for an unknown device code", async () => {
    const { fetchImpl } = fakeServer({
      "GET /api/auth/device": {
        status: 400,
        body: { error: "invalid_request", error_description: "Invalid user code" },
      },
    })
    await expect(createWebAuth(BASE, fetchImpl).device.lookup("NOPE")).rejects.toThrow(
      "Invalid user code",
    )
  })

  it("falls back to a fixed message for an unknown device code with no description", async () => {
    const { fetchImpl } = fakeServer({ "GET /api/auth/device": { status: 400, body: {} } })
    await expect(createWebAuth(BASE, fetchImpl).device.lookup("NOPE")).rejects.toThrow(
      "That code was not recognised",
    )
  })
})
describe("organization calls for the org switcher", () => {
  it("checkSlug answers true for a free slug, false for a taken one, and throws for anything else", async () => {
    const free = fakeServer({
      "POST /api/auth/organization/check-slug": { body: { status: true } },
    })
    await expect(createWebAuth(BASE, free.fetchImpl).checkSlug("acme")).resolves.toBe(true)
    expect(free.calls.at(-1)).toMatchObject({ body: { slug: "acme" } })

    const taken = fakeServer({
      "POST /api/auth/organization/check-slug": {
        status: 400,
        body: { code: "ORGANIZATION_SLUG_ALREADY_TAKEN", message: "taken" },
      },
    })
    await expect(createWebAuth(BASE, taken.fetchImpl).checkSlug("acme")).resolves.toBe(false)

    const broken = fakeServer({
      "POST /api/auth/organization/check-slug": { status: 500, body: { message: "down" } },
    })
    await expect(createWebAuth(BASE, broken.fetchImpl).checkSlug("acme")).rejects.toBeInstanceOf(
      WebError,
    )
  })

  it("memberRole asks for the role in the organization it names, not the active one", async () => {
    const { fetchImpl, calls } = fakeServer({
      "GET /api/auth/organization/get-active-member-role": { body: { role: "admin" } },
    })
    await expect(createWebAuth(BASE, fetchImpl).memberRole("org-b")).resolves.toBe("admin")
    expect(calls.at(-1)?.search).toContain("organizationId=org-b")
  })

  it("createOrganization sends the name and slug, and maps the new organization", async () => {
    const { fetchImpl, calls } = fakeServer({
      "POST /api/auth/organization/create": {
        body: { id: "org-new", name: "Acme Labs", slug: "acme-labs", logo: null },
      },
    })
    await expect(
      createWebAuth(BASE, fetchImpl).createOrganization({ name: "Acme Labs", slug: "acme-labs" }),
    ).resolves.toEqual({ id: "org-new", name: "Acme Labs", slug: "acme-labs" })
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      path: "/api/auth/organization/create",
      body: { name: "Acme Labs", slug: "acme-labs" },
    })
  })
})
