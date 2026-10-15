// End-to-end auth flows over HTTP, driven the way a web app drives them: the real `createClient`,
// a cookie jar and an Origin header, through the app's router into better-auth. These are the
// flows that must keep working across better-auth upgrades, including minor and patch releases,
// so they assert status codes, error codes, cookies, redirects and emails rather than internals.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { BASE, createTestApp } from "./app.test.helpers"
import { browser } from "./browser.test.helpers"

const PASSWORD = "correct-horse-battery"
/** What the product API answers for a session that no longer works. */
const SIGNED_OUT = { status: 401, body: { error: { code: "UNAUTHORIZED" } } }

describe("auth flows over HTTP (real client, real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  beforeAll(async () => {
    t = await createTestApp()
  })
  afterAll(() => t.close())

  const open = () => browser((url, init) => t.app.request(url, init))
  let n = 0
  const email = () => `flow${++n}@example.com`

  /** Sign up in a fresh browser. */
  async function signedUp(name = "Ada") {
    const b = open()
    const address = email()
    const { data, error } = await b.client.signUp.email({
      email: address,
      password: PASSWORD,
      name,
    })
    if (error || !data) throw new Error(`sign-up failed: ${JSON.stringify(error)}`)
    return { b, email: address, userId: data.user.id }
  }

  const whoami = async (b: ReturnType<typeof open>) => {
    const res = await b.request("/v1/whoami")
    return {
      status: res.status,
      body: (await res.json()) as { organizationId?: string; error?: { code: string } },
    }
  }

  /** Emails to an address, once at least `count` have arrived (senders may run in the background). */
  const delivered = (to: string, count = 1) =>
    vi.waitFor(() => {
      const mails = inbox(to)
      if (mails.length < count) throw new Error(`waiting for ${count} email(s) to ${to}`)
      return mails
    })

  const inbox = (to: string) => t.outbox.filter((m) => m.to === to)

  describe("sign-up and sessions", () => {
    it("signs up into a session acting in a new personal organization", async () => {
      const { b, userId } = await signedUp("Grace")
      expect(b.jar.size).toBeGreaterThan(0)

      const { data: session } = await b.client.getSession()
      expect(session?.user.id).toBe(userId)
      const orgId = session?.session.activeOrganizationId
      expect(orgId).toBeTruthy()

      const { data: orgs } = await b.client.organization.list()
      expect(orgs?.map((o) => o.id)).toEqual([orgId])
      expect(orgs?.[0]?.name).toBe("Grace's workspace")
      const { data: member } = await b.client.organization.getActiveMember()
      expect(member?.role).toBe("owner")

      // The cookie works against the product API, not just better-auth.
      expect(await whoami(b)).toMatchObject({ status: 200, body: { organizationId: orgId } })
    })

    it("rejects a second sign-up with the same email", async () => {
      const { email: taken } = await signedUp()
      const { error } = await open().client.signUp.email({
        email: taken,
        password: PASSWORD,
        name: "Again",
      })
      expect(error).toMatchObject({ status: 422, code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })
    })

    it("signs in with the right password only", async () => {
      const { email: address } = await signedUp()
      const wrong = await open().client.signIn.email({ email: address, password: "not-it-12345" })
      expect(wrong.error).toMatchObject({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })

      const b = open()
      const { data, error } = await b.client.signIn.email({ email: address, password: PASSWORD })
      expect(error).toBeNull()
      expect(data?.user.email).toBe(address)
      expect((await whoami(b)).status).toBe(200)
    })

    it("signs out: the session stops working", async () => {
      const { b } = await signedUp()
      const before = b.cookie()
      expect((await b.client.signOut()).error).toBeNull()
      expect((await b.client.getSession()).data).toBeNull()
      expect(await whoami(b)).toMatchObject(SIGNED_OUT)

      // Replaying the old cookie doesn't bring it back.
      const replay = await t.req("/v1/whoami", { headers: { cookie: before } })
      expect(replay.status).toBe(401)
    })

    it("lists a user's sessions and revokes the others", async () => {
      const { b: laptop, email: address } = await signedUp()
      const phone = open()
      await phone.client.signIn.email({ email: address, password: PASSWORD })

      const { data: sessions } = await laptop.client.listSessions()
      expect(sessions).toHaveLength(2)

      expect((await laptop.client.revokeOtherSessions()).error).toBeNull()
      expect(await whoami(phone)).toMatchObject(SIGNED_OUT)
      expect((await whoami(laptop)).status).toBe(200)
    })
  })

  describe("CSRF", () => {
    it("rejects cookie requests from an untrusted origin or with no origin", async () => {
      const { b } = await signedUp()
      const body = JSON.stringify({ name: "Evil", slug: `evil-${n}` })
      const post = (headers: Record<string, string>) =>
        b.request("/api/auth/organization/create", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body,
        })

      const evil = await post({ origin: "https://evil.example" })
      expect(evil.status).toBe(403)
      expect(await evil.json()).toMatchObject({ code: "INVALID_ORIGIN" })

      // `browser` adds Origin unless one is set; "null" is what a sandboxed page sends.
      const nullOrigin = await post({ origin: "null" })
      expect(nullOrigin.status).toBe(403)
      expect(await nullOrigin.json()).toMatchObject({ code: "MISSING_OR_NULL_ORIGIN" })

      const { data: orgs } = await b.client.organization.list()
      expect(orgs).toHaveLength(1)
    })

    it("refuses a password-reset link that would redirect off-site", async () => {
      const { email: address } = await signedUp()
      const { error } = await open().client.requestPasswordReset({
        email: address,
        redirectTo: "https://evil.example/steal",
      })
      expect(error).toMatchObject({ status: 403, code: "INVALID_REDIRECT_URL" })
      expect(inbox(address)).toHaveLength(0)
    })
  })

  describe("password reset by email", () => {
    it("emails a link that leads to a working new password", async () => {
      const { b: old, email: address } = await signedUp()
      const visitor = open()
      const { error } = await visitor.client.requestPasswordReset({
        email: address,
        redirectTo: `${BASE}/reset-password`,
      })
      expect(error).toBeNull()

      const [mail] = await delivered(address)
      expect(mail?.link).toMatch(/^http:\/\/localhost:3000\/api\/auth\/reset-password\//)

      // The emailed link redirects to the app's page with the token in the query.
      const landing = await visitor.request(mail?.link ?? "")
      expect(landing.status).toBe(302)
      const page = new URL(landing.headers.get("location") ?? "")
      expect(`${page.origin}${page.pathname}`).toBe(`${BASE}/reset-password`)
      const token = page.searchParams.get("token") ?? ""
      expect(token).toBeTruthy()

      const reset = await visitor.client.resetPassword({ newPassword: "a-new-passphrase", token })
      expect(reset.error).toBeNull()

      const stale = await open().client.signIn.email({ email: address, password: PASSWORD })
      expect(stale.error?.code).toBe("INVALID_EMAIL_OR_PASSWORD")
      const fresh = await open().client.signIn.email({
        email: address,
        password: "a-new-passphrase",
      })
      expect(fresh.error).toBeNull()

      // A token works once.
      const again = await visitor.client.resetPassword({ newPassword: "yet-another-one", token })
      expect(again.error).toMatchObject({ status: 400, code: "INVALID_TOKEN" })

      // The Wraps plugin's password-changed notice went out after the reset.
      const notices = await delivered(address, 2)
      expect(notices).toHaveLength(2)
      expect(notices[1]?.subject).toMatch(/password/i)
      // A reset signs out every existing session (revokeSessionsOnPasswordReset).
      expect(await whoami(old)).toMatchObject(SIGNED_OUT)
    })

    it("answers the same for an unknown email and sends nothing", async () => {
      const before = t.outbox.length
      const { error } = await open().client.requestPasswordReset({
        email: "nobody@example.com",
        redirectTo: `${BASE}/reset-password`,
      })
      expect(error).toBeNull()
      expect(t.outbox.length).toBe(before)
    })

    it("sends a bad or missing token back to the app with an error", async () => {
      const landing = await open().request(
        `/api/auth/reset-password/not-a-token?callbackURL=${encodeURIComponent(`${BASE}/reset`)}`,
      )
      expect(landing.status).toBe(302)
      expect(landing.headers.get("location")).toBe(`${BASE}/reset?error=INVALID_TOKEN`)

      const { error } = await open().client.resetPassword({
        newPassword: "whatever-1234",
        token: "not-a-token",
      })
      expect(error).toMatchObject({ status: 400, code: "INVALID_TOKEN" })
    })
  })

  describe("email verification", () => {
    it("emails a link that marks the address verified", async () => {
      const { b, email: address } = await signedUp()
      expect((await b.client.getSession()).data?.user.emailVerified).toBe(false)

      const { error } = await b.client.sendVerificationEmail({
        email: address,
        callbackURL: "/welcome",
      })
      expect(error).toBeNull()
      const [mail] = await delivered(address)
      expect(mail?.link).toMatch(/^http:\/\/localhost:3000\/api\/auth\/verify-email\?token=/)

      const landing = await b.request(mail?.link ?? "")
      expect(landing.status).toBe(302)
      expect(landing.headers.get("location")).toBe("/welcome")
      expect(
        (await b.client.getSession({ query: { disableCookieCache: true } })).data?.user
          .emailVerified,
      ).toBe(true)
    })

    it("rejects a forged token", async () => {
      const res = await open().request("/api/auth/verify-email?token=forged")
      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: "INVALID_TOKEN" })
    })
  })

  describe("change password", () => {
    it("needs the current password, and can sign out every other session", async () => {
      const { b: laptop, email: address } = await signedUp()
      const phone = open()
      await phone.client.signIn.email({ email: address, password: PASSWORD })

      const wrong = await laptop.client.changePassword({
        currentPassword: "not-it-12345",
        newPassword: "a-new-passphrase",
      })
      expect(wrong.error).toMatchObject({ status: 400, code: "INVALID_PASSWORD" })

      const ok = await laptop.client.changePassword({
        currentPassword: PASSWORD,
        newPassword: "a-new-passphrase",
        revokeOtherSessions: true,
      })
      expect(ok.error).toBeNull()
      expect(await whoami(phone)).toMatchObject(SIGNED_OUT)
      expect((await whoami(laptop)).status).toBe(200)
      const fresh = await open().client.signIn.email({
        email: address,
        password: "a-new-passphrase",
      })
      expect(fresh.error).toBeNull()
    })
  })

  describe("organizations", () => {
    it("creates a team, invites by email, and the invitee accepts after signing up", async () => {
      const { b: owner } = await signedUp("Owner")
      const { data: org, error } = await owner.client.organization.create({
        name: "Acme",
        slug: `acme-${n}`,
      })
      expect(error).toBeNull()
      if (!org) throw new Error("no organization")
      await owner.client.organization.setActive({ organizationId: org.id })
      expect((await whoami(owner)).body.organizationId).toBe(org.id)

      const inviteeEmail = email()
      const invite = await owner.client.organization.inviteMember({
        email: inviteeEmail,
        role: "member",
        organizationId: org.id,
      })
      expect(invite.error).toBeNull()

      // The invitation email links to the app's accept page with the invitation id.
      const [mail] = await delivered(inviteeEmail)
      expect(mail?.subject).toContain("Acme")
      const link = new URL(mail?.link ?? "")
      expect(link.pathname).toMatch(/^\/accept-invitation\/[^/]+$/)
      const invitationId = link.pathname.split("/").pop() ?? ""

      const invitee = open()
      await invitee.client.signUp.email({ email: inviteeEmail, password: PASSWORD, name: "New" })
      // Browsing your invitations needs a verified address; accepting from the emailed link doesn't.
      const unverified = await invitee.client.organization.listUserInvitations()
      expect(unverified.error).toMatchObject({
        status: 403,
        code: "EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION",
      })

      // Someone who has the link but isn't the invited address can't use it.
      const { b: stranger } = await signedUp("Stranger")
      const stolen = await stranger.client.organization.acceptInvitation({ invitationId })
      expect(stolen.error).toMatchObject({
        status: 403,
        code: "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
      })

      const accepted = await invitee.client.organization.acceptInvitation({ invitationId })
      expect(accepted.error).toBeNull()
      // Accepting makes the new organization the active one.
      expect(await whoami(invitee)).toMatchObject({ status: 200, body: { organizationId: org.id } })

      const { data: full } = await owner.client.organization.getFullOrganization()
      expect(full?.members.map((m) => m.role).sort()).toEqual(["member", "owner"])
    })

    it("changes a member's role, then removes them, cutting off their access", async () => {
      const { b: owner } = await signedUp("Owner")
      const { b: other, userId } = await signedUp("Other")
      const { data: org } = await owner.client.organization.create({
        name: "Team",
        slug: `team-${n}`,
      })
      if (!org) throw new Error("no organization")
      await t.auth.api.addMember({ body: { organizationId: org.id, userId, role: "viewer" } })
      await other.client.organization.setActive({ organizationId: org.id })
      expect((await whoami(other)).body.organizationId).toBe(org.id)

      const { data: full } = await owner.client.organization.getFullOrganization({
        query: { organizationId: org.id },
      })
      const memberId = full?.members.find((m) => m.userId === userId)?.id ?? ""

      // A viewer can't promote themselves.
      const self = await other.client.organization.updateMemberRole({
        memberId,
        role: "admin",
        organizationId: org.id,
      })
      expect(self.error?.status).toBe(403)

      const promoted = await owner.client.organization.updateMemberRole({
        memberId,
        role: "admin",
        organizationId: org.id,
      })
      expect(promoted.error).toBeNull()
      const { data: role } = await other.client.organization.getActiveMemberRole()
      expect(role?.role).toBe("admin")

      const removed = await owner.client.organization.removeMember({
        memberIdOrEmail: memberId,
        organizationId: org.id,
      })
      expect(removed.error).toBeNull()
      expect(await whoami(other)).toMatchObject(SIGNED_OUT)
    })

    it("lets a member leave, and an owner delete the organization", async () => {
      const { b: owner } = await signedUp("Owner")
      const { b: other, userId } = await signedUp("Other")
      const { data: org } = await owner.client.organization.create({
        name: "Short-lived",
        slug: `short-${n}`,
      })
      if (!org) throw new Error("no organization")
      await t.auth.api.addMember({ body: { organizationId: org.id, userId, role: "member" } })

      expect((await other.client.organization.leave({ organizationId: org.id })).error).toBeNull()
      const { data: left } = await other.client.organization.list()
      expect(left?.map((o) => o.id)).not.toContain(org.id)

      const deleted = await owner.client.organization.delete({ organizationId: org.id })
      expect(deleted.error).toBeNull()
      const { data: remaining } = await owner.client.organization.list()
      expect(remaining?.map((o) => o.id)).not.toContain(org.id)
    })
  })

  describe("endpoints that must stay off or on", () => {
    it("keeps the session-to-JWT endpoint disabled and get-session free of JWTs", async () => {
      const { b } = await signedUp()
      expect((await b.request("/api/auth/token")).status).toBe(404)
      const session = await b.request("/api/auth/get-session")
      expect(session.status).toBe(200)
      expect(session.headers.get("set-auth-jwt")).toBeNull()
    })

    it("publishes the JWKS that OAuth access tokens are verified with", async () => {
      const res = await t.req("/api/auth/jwks")
      expect(res.status).toBe(200)
      const { keys } = (await res.json()) as { keys: { kid: string }[] }
      expect(keys.length).toBeGreaterThan(0)
    })
  })
})
