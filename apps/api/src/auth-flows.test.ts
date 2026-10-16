// End-to-end auth flows over HTTP, driven the way a web app drives them: the real `createClient`,
// a cookie jar and an Origin header, through the app's router into better-auth. These are the
// flows that must keep working across better-auth upgrades, including minor and patch releases,
// so they assert status codes, error codes, cookies, redirects and emails rather than internals.
import { createHash, createHmac, randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createLogger } from "@starter/logger"
import { BASE, createTestApp } from "./app.test.helpers"
import { browser } from "./browser.test.helpers"

const PASSWORD = "correct-horse-battery"
/** RFC 4648 base32, as authenticator secrets are written. */
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const c of input.replace(/=+$/, "").toUpperCase()) {
    value = ((value << 5) | alphabet.indexOf(c)) & 0xffff
    bits += 5
    if (bits >= 8) {
      out.push((value >> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** The 6-digit TOTP (RFC 6238, 30 seconds, SHA-1) an authenticator app shows for a secret. */
function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const hash = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = (hash[hash.length - 1] ?? 0) & 0xf
  const code =
    (((hash[offset] ?? 0) & 0x7f) << 24) |
    ((hash[offset + 1] ?? 0) << 16) |
    ((hash[offset + 2] ?? 0) << 8) |
    (hash[offset + 3] ?? 0)
  return String(code % 1_000_000).padStart(6, "0")
}

const REDIRECT = "http://127.0.0.1:33418/callback"
const MCP = `${BASE}/mcp`

/** What the product API answers for a session that no longer works. */
const SIGNED_OUT = { status: 401, body: { error: { code: "UNAUTHORIZED" } } }

describe("auth flows over HTTP (real client, real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  /** Every access-log line the app writes. */
  const logLines: string[] = []
  beforeAll(async () => {
    const logger = createLogger({ level: "info", destination: { write: (s) => logLines.push(s) } })
    t = await createTestApp([], { logger })
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
    it("keeps the reset token out of the access log", async () => {
      const { email: address } = await signedUp()
      const visitor = open()
      await visitor.client.requestPasswordReset({ email: address, redirectTo: `${BASE}/reset` })
      const [mail] = await delivered(address)
      const token = new URL(mail?.link ?? "").pathname.split("/").at(-1) ?? ""
      expect(token.length).toBeGreaterThan(8)

      const before = logLines.length
      await visitor.request(mail?.link ?? "")
      const visit = logLines.slice(before).join("")
      expect(visit).not.toContain(token)
      expect(visit).toContain("/api/auth/reset-password/[Redacted]")
    })

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

  describe("magic links", () => {
    it("emails a sign-in link that signs the person in and records the method", async () => {
      const { b, email: address } = await signedUp()
      await b.client.signOut()

      const visitor = open()
      const { error } = await visitor.client.signIn.magicLink({
        email: address,
        callbackURL: "/welcome",
      })
      expect(error).toBeNull()
      const [mail] = await delivered(address)
      expect(mail?.link).toMatch(/^http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?token=/)

      const landing = await visitor.request(mail?.link ?? "")
      expect(landing.status).toBe(302)
      expect(landing.headers.get("location")).toBe(`${BASE}/welcome`)
      expect((await whoami(visitor)).status).toBe(200)
      expect(
        ((await visitor.client.getSession()).data?.user as { lastLoginMethod?: string } | undefined)
          ?.lastLoginMethod,
      ).toBe("magic-link")
    })

    it("refuses a link twice, and a forged one, with an error the app can show", async () => {
      const { email: address } = await signedUp()
      const visitor = open()
      await visitor.client.signIn.magicLink({ email: address, callbackURL: "/welcome" })
      const [mail] = await delivered(address, 1)
      expect((await visitor.request(mail?.link ?? "")).status).toBe(302)

      const again = await open().request(mail?.link ?? "")
      expect(again.headers.get("location")).toContain("error=INVALID_TOKEN")

      const forged = await open().request("/api/auth/magic-link/verify?token=forged")
      expect(forged.headers.get("location")).toContain("error=INVALID_TOKEN")
    })

    it("claims a provisional signup: the magic link verifies the address and ends its key", async () => {
      const address = `magic-claim-${++n}@example.com`
      const made = await t.req("/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, name: "Agent" }),
      })
      const { apiKey } = (await made.json()) as { apiKey: string }
      expect((await t.req("/v1/whoami", { headers: { "x-api-key": apiKey } })).status).toBe(200)

      const visitor = open()
      await visitor.client.signIn.magicLink({ email: address, callbackURL: "/" })
      const link = (await delivered(address, 2)).find((m) =>
        m.link.includes("/magic-link/verify"),
      )?.link
      expect(link).toBeTruthy()
      expect((await visitor.request(link ?? "")).status).toBe(302)

      const stopped = await t.req("/v1/whoami", { headers: { "x-api-key": apiKey } })
      expect(stopped.status).toBe(401)
      expect(await stopped.json()).toMatchObject({
        error: { code: "UNAUTHORIZED", hint: expect.stringContaining("device") },
      })
      expect((await whoami(visitor)).status).toBe(200)
    })
  })

  describe("magic links and two-factor", () => {
    /** A user with an authenticator enrolled, signed out. */
    async function enrolled(name: string) {
      const { b, email: address } = await signedUp(name)
      const enrol = await b.client.twoFactor.enable({ password: PASSWORD })
      const secret =
        new URL((enrol.data as { totpURI?: string } | null)?.totpURI ?? "").searchParams.get(
          "secret",
        ) ?? ""
      await b.client.twoFactor.verifyTotp({ code: totp(secret) })
      await b.client.signOut()
      return { address, secret }
    }

    /** The newest link emailed to an address, after asking for one. */
    async function requestLink(address: string, callbackURL?: string) {
      const before = inbox(address).length
      const visitor = open()
      await visitor.client.signIn.magicLink(
        callbackURL === undefined ? { email: address } : { email: address, callbackURL },
      )
      await delivered(address, before + 1)
      return { visitor, link: inbox(address).at(-1)?.link ?? "" }
    }

    it("a second-factor user who opens a link gets the code entry, not a session", async () => {
      const { address, secret } = await enrolled("Linked")
      const { visitor, link } = await requestLink(address, "/welcome")

      const landing = await visitor.request(link)
      expect(landing.status).toBe(302)
      const next = new URL(landing.headers.get("location") ?? "")
      expect(next.origin + next.pathname).toBe(`${BASE}/two-factor`)
      // The link's callbackURL is the app path it was sent with: the code entry sends the person there.
      expect(next.searchParams.get("callbackURL")).toBe("/welcome")
      expect((await whoami(visitor)).status).toBe(401)
      expect((await visitor.client.getSession()).data).toBeNull()

      const code = await visitor.client.twoFactor.verifyTotp({ code: totp(secret) })
      expect(code.error).toBeNull()
      expect((await whoami(visitor)).status).toBe(200)
    })

    it("a wrong code after a link does not open the session", async () => {
      const { address } = await enrolled("Guessed")
      const { visitor, link } = await requestLink(address, "/welcome")
      await visitor.request(link)
      const wrong = await visitor.client.twoFactor.verifyTotp({ code: "000000" })
      expect(wrong.error).toMatchObject({ status: 401 })
      expect((await whoami(visitor)).status).toBe(401)
    })

    it("a user without two-factor still signs straight in from the link", async () => {
      const { email: address } = await signedUp("Plainly")
      const { visitor, link } = await requestLink(address, "/welcome")
      const landing = await visitor.request(link)
      expect(landing.headers.get("location")).toBe(`${BASE}/welcome`)
      expect((await whoami(visitor)).status).toBe(200)
    })
  })

  describe("two-factor (TOTP)", () => {
    it("enrols an authenticator, then requires its code on the next sign-in", async () => {
      const { b, email: address } = await signedUp()
      const enabling = await b.client.twoFactor.enable({ password: PASSWORD })
      expect(enabling.error).toBeNull()
      const secret =
        new URL((enabling.data as { totpURI?: string } | null)?.totpURI ?? "").searchParams.get(
          "secret",
        ) ?? ""
      expect(secret.length).toBeGreaterThan(8)
      expect((await b.client.twoFactor.verifyTotp({ code: totp(secret) })).error).toBeNull()
      expect((await b.client.getSession()).data?.user.twoFactorEnabled).toBe(true)
      await b.client.signOut()

      const visitor = open()
      const first = await visitor.client.signIn.email({ email: address, password: PASSWORD })
      expect((first.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect).toBe(true)
      expect(first.data?.user).toBeUndefined()
      expect((await whoami(visitor)).status).toBe(401)

      const wrong = await visitor.client.twoFactor.verifyTotp({ code: "000000" })
      expect(wrong.error).toMatchObject({ status: 401 })
      const right = await visitor.client.twoFactor.verifyTotp({ code: totp(secret) })
      expect(right.error).toBeNull()
      expect((await whoami(visitor)).status).toBe(200)
    })
  })

  describe("two-factor: backup codes and trusted devices", () => {
    it("trusts a device after its second factor, and takes a backup code once", async () => {
      const { b, email: address } = await signedUp()
      const enrol = await b.client.twoFactor.enable({ password: PASSWORD })
      const secret =
        new URL((enrol.data as { totpURI?: string } | null)?.totpURI ?? "").searchParams.get(
          "secret",
        ) ?? ""
      const backupCodes = (enrol.data as { backupCodes?: string[] } | null)?.backupCodes ?? []
      expect(backupCodes.length).toBeGreaterThan(0)
      await b.client.twoFactor.verifyTotp({ code: totp(secret) })
      await b.client.signOut()

      // This browser passes the second factor once, and asks to trust the device.
      const device = open()
      await device.client.signIn.email({ email: address, password: PASSWORD })
      const trusting = await device.client.twoFactor.verifyTotp({
        code: totp(secret),
        trustDevice: true,
      })
      expect(trusting.error).toBeNull()
      await device.client.signOut()
      const again = await device.client.signIn.email({ email: address, password: PASSWORD })
      expect((again.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect).toBeFalsy()
      expect((await whoami(device)).status).toBe(200)

      // Another browser has no trusted device: a backup code gets it in, once.
      const other = open()
      const first = await other.client.signIn.email({ email: address, password: PASSWORD })
      expect((first.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect).toBe(true)
      const used = await other.client.twoFactor.verifyBackupCode({ code: backupCodes[0] ?? "" })
      expect(used.error).toBeNull()
      expect((await whoami(other)).status).toBe(200)

      const replay = await open().client.signIn.email({ email: address, password: PASSWORD })
      expect((replay.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect).toBe(true)
      const reused = await open().client.twoFactor.verifyBackupCode({
        code: backupCodes[0] ?? "",
      })
      expect(reused.error).toBeTruthy()
    })
  })

  describe("passkeys", () => {
    it("offers registration to a signed-in person only, bound to the app's host", async () => {
      const { b } = await signedUp()
      const signedIn = await b.request("/api/auth/passkey/generate-register-options")
      expect(signedIn.status).toBe(200)
      const options = (await signedIn.json()) as { challenge?: string; rp?: { id?: string } }
      expect(options.challenge).toBeTruthy()
      expect(options.rp?.id).toBe("localhost")

      const anonymous = await open().request("/api/auth/passkey/generate-register-options")
      expect(anonymous.status).toBe(401)
    })
  })

  describe("sign-in with an OAuth authorization pending", () => {
    /** The query an authorization request carries, as an MCP client sends it (with PKCE). */
    async function startAuthorization() {
      const reg = await t.req("/api/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Agent",
          redirect_uris: [REDIRECT],
          token_endpoint_auth_method: "none",
        }),
      })
      const clientId = ((await reg.json()) as { client_id: string }).client_id
      const verifier = randomBytes(32).toString("base64url")
      const query = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        scope: "openid offline_access read",
        state: "s1",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        resource: MCP,
      })
      return { clientId, verifier, query }
    }

    /** The signed query the page's client sends back (what oauthProviderClient builds). */
    const signedOAuthQuery = (search: string) => {
      const params = new URLSearchParams(search)
      const names = new Set(params.getAll("ba_param"))
      const out = new URLSearchParams()
      for (const [k, v] of params)
        if (k === "sig" || k === "ba_param" || names.has(k)) out.append(k, v)
      return out.toString()
    }

    /** Authorization goes to the sign-in page first; returns that page's signed query. */
    async function toSignIn(b: ReturnType<typeof open>, query: URLSearchParams) {
      const res = await b.request(`/api/auth/oauth2/authorize?${query}`)
      const login = new URL(res.headers.get("location") ?? "", BASE)
      expect(login.pathname).toBe("/sign-in")
      return signedOAuthQuery(login.search)
    }

    /** Accept consent on the pending authorization, then exchange the code for a token. */
    async function finish(
      b: ReturnType<typeof open>,
      next: URL,
      a: { clientId: string; verifier: string },
    ) {
      const consent = await b.request("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept: true, oauth_query: next.search.slice(1) }),
      })
      const { url } = (await consent.json()) as { url: string }
      const code = new URL(url).searchParams.get("code") ?? ""
      const token = await t.req("/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: a.clientId,
          code_verifier: a.verifier,
          resource: MCP,
        }),
      })
      const body = (await token.json()) as { access_token?: string }
      expect(body.access_token).toBeTruthy()
      return body.access_token ?? ""
    }

    it("resumes the authorization after a magic-link sign-in", async () => {
      const { email: address } = await signedUp("Mara")
      const a = await startAuthorization()
      const b = open()
      const oauthQuery = await toSignIn(b, a.query)

      const sent = await b.request("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, callbackURL: "/", oauth_query: oauthQuery }),
      })
      expect(sent.status).toBe(200)
      const [mail] = await delivered(address)

      // The emailed link opens in the same browser, which still holds the pending authorization.
      // The link carries the authorization to the authorize endpoint, which now has a session.
      const landing = await b.request(mail?.link ?? "")
      expect(landing.status).toBe(302)
      const resumed = await b.request(landing.headers.get("location") ?? "")
      expect(resumed.status).toBe(302)
      const next = new URL(resumed.headers.get("location") ?? "", BASE)
      expect(next.pathname).toBe("/consent")

      const accessToken = await finish(b, next, a)
      const { decodeJwt } = await import("jose")
      expect(decodeJwt(accessToken).org).toBeTruthy()
    })

    it("refuses a forged authorization query on a magic-link sign-in", async () => {
      const { email: address } = await signedUp()
      const a = await startAuthorization()
      const forged = (await toSignIn(open(), a.query)).replace(/sig=[^&]+/, "sig=forged")
      const res = await open().request("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, callbackURL: "/", oauth_query: forged }),
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: "invalid_signature" })
      expect(inbox(address)).toHaveLength(0)
    })

    it("sends a failed link back to sign-in, where the person can see why", async () => {
      const { email: address } = await signedUp()
      const a = await startAuthorization()
      const b = open()
      const oauthQuery = await toSignIn(b, a.query)
      await b.request("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, callbackURL: "/", oauth_query: oauthQuery }),
      })
      const [mail] = await delivered(address)
      const broken = new URL(mail?.link ?? "")
      broken.searchParams.set("token", "forged")
      const landing = await b.request(`${broken.pathname}${broken.search}`)
      const next = new URL(landing.headers.get("location") ?? "", BASE)
      expect(next.pathname).toBe("/sign-in")
      expect(next.searchParams.get("error")).toBe("INVALID_TOKEN")
    })

    it("an impersonated session gets no code, even for an authorization the user already granted", async () => {
      const { b: owner, userId: ownerId } = await signedUp("Granted")
      const a = await startAuthorization()
      const first = await owner.request(`/api/auth/oauth2/authorize?${a.query}`)
      await finish(owner, new URL(first.headers.get("location") ?? "", BASE), a)

      const { b: admin, userId: adminId } = await signedUp("Root")
      await (await t.auth.$context).adapter.updateMany({
        model: "user",
        where: [{ field: "id", value: adminId }],
        update: { role: "admin" },
      })
      expect((await admin.client.admin.impersonateUser({ userId: ownerId })).error).toBeNull()

      const again = await admin.request(`/api/auth/oauth2/authorize?${a.query}`)
      expect(again.status).toBe(403)
      expect(await again.json()).toMatchObject({ code: "IMPERSONATED_SESSION_NOT_ALLOWED" })
      expect(again.headers.get("location")).toBeNull()
    })

    it("resumes the authorization after the second factor", async () => {
      const { b: owner, email: address } = await signedUp("Tofu")
      const enrol = await owner.client.twoFactor.enable({ password: PASSWORD })
      const secret =
        new URL((enrol.data as { totpURI?: string } | null)?.totpURI ?? "").searchParams.get(
          "secret",
        ) ?? ""
      await owner.client.twoFactor.verifyTotp({ code: totp(secret) })
      await owner.client.signOut()

      const a = await startAuthorization()
      const b = open()
      const oauthQuery = await toSignIn(b, a.query)
      const first = await b.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, password: PASSWORD, oauth_query: oauthQuery }),
      })
      expect(((await first.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true)

      const second = await b.request("/api/auth/two-factor/verify-totp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The two-factor page keeps its query, so the app sends it back with the code.
        body: JSON.stringify({ code: totp(secret), oauth_query: oauthQuery }),
      })
      const text = await second.text()
      const location = second.headers.get("location") ?? (JSON.parse(text) as { url?: string }).url
      const next = new URL(location ?? "", BASE)
      expect(next.pathname).toBe("/consent")

      const accessToken = await finish(b, next, a)
      const { decodeJwt } = await import("jose")
      expect(decodeJwt(accessToken).org).toBeTruthy()
    })
  })

  describe("GitHub and Google sign-in (provider fetches faked)", () => {
    let s: Awaited<ReturnType<typeof createTestApp>>
    let githubEmail = ""
    /** GitHub's id for the account is per address, as it would be for real people. */
    const githubAccountId = () =>
      [...githubEmail].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    const realFetch = globalThis.fetch
    const social = () => browser((url, init) => s.app.request(url, init))

    beforeAll(async () => {
      s = await createTestApp([], { github: { clientId: "gh-client", clientSecret: "gh-secret" } })
      // GitHub's token and profile endpoints, answered for the address under test.
      vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input)
        const json = (body: unknown) =>
          Promise.resolve(
            new Response(JSON.stringify(body), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          )
        if (url === "https://github.com/login/oauth/access_token")
          return json({ access_token: "gho_test", token_type: "bearer", scope: "user:email" })
        if (url === "https://api.github.com/user")
          return json({
            id: githubAccountId(),
            login: "octo",
            name: "Octo Cat",
            email: githubEmail,
            avatar_url: "",
          })
        if (url === "https://api.github.com/user/emails")
          return json([{ email: githubEmail, primary: true, verified: true }])
        return realFetch(input, init)
      })
    })
    afterAll(async () => {
      vi.unstubAllGlobals()
      await s.close()
    })

    it("offers only the providers that are configured", async () => {
      const b = social()
      const google = await b.client.signIn.social({ provider: "google", callbackURL: "/" })
      expect(google.error).toBeTruthy()
      const github = await b.client.signIn.social({ provider: "github", callbackURL: "/" })
      expect(github.error).toBeNull()
      const authorize = new URL(github.data?.url ?? "")
      expect(authorize.origin + authorize.pathname).toBe("https://github.com/login/oauth/authorize")
      expect(authorize.searchParams.get("client_id")).toBe("gh-client")
    })

    it("signs a new GitHub address up into a personal organization", async () => {
      const address = `octo-new-${++n}@example.com`
      githubEmail = address
      const b = social()
      const start = await b.client.signIn.social({ provider: "github", callbackURL: "/welcome" })
      const state = new URL(start.data?.url ?? "").searchParams.get("state") ?? ""
      const back = await b.request(`/api/auth/callback/github?code=test-code&state=${state}`)
      expect(back.status).toBe(302)
      expect(new URL(back.headers.get("location") ?? "", BASE).pathname).toBe("/welcome")

      const { data: session } = await b.client.getSession()
      expect(session?.user.email).toBe(address)
      expect(session?.session.activeOrganizationId).toBeTruthy()
      expect((await whoami(b)).status).toBe(200)
      expect((session?.user as { lastLoginMethod?: string } | undefined)?.lastLoginMethod).toBe(
        "github",
      )
    })

    it("cannot claim a provisional signup: the same address on GitHub is refused, the key stays on", async () => {
      // Linking to an account whose address isn't verified yet is refused (better-auth's
      // requireLocalEmailVerified default), so a social login can't take over a provisional account.
      const address = `octo-claim-${++n}@example.com`
      githubEmail = address
      const made = await s.req("/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, name: "Octo" }),
      })
      const { apiKey } = (await made.json()) as { apiKey: string }

      const b = social()
      const start = await b.client.signIn.social({ provider: "github", callbackURL: "/welcome" })
      const state = new URL(start.data?.url ?? "").searchParams.get("state") ?? ""
      const back = await b.request(`/api/auth/callback/github?code=test-code&state=${state}`)
      expect(new URL(back.headers.get("location") ?? "", BASE).searchParams.get("error")).toBe(
        "account_not_linked",
      )
      expect((await whoami(b)).status).toBe(SIGNED_OUT.status)

      expect((await s.req("/v1/whoami", { headers: { "x-api-key": apiKey } })).status).toBe(200)
    })
  })

  describe("impersonation", () => {
    it("an impersonated session is read-only and cannot create keys or consent", async () => {
      const { b: admin, userId: adminId } = await signedUp("Root")
      const { userId: victimId } = await signedUp("Victim")
      const ctx = await t.auth.$context
      await ctx.adapter.updateMany({
        model: "user",
        where: [{ field: "id", value: adminId }],
        update: { role: "admin" },
      })
      // Impersonation starts from the admin's own session.
      const start = await admin.client.admin.impersonateUser({ userId: victimId })
      expect(start.error).toBeNull()

      const session = await admin.client.getSession()
      expect(session.data?.user.id).toBe(victimId)
      expect(await whoami(admin)).toMatchObject({ status: 200 })

      const key = await admin.request("/api/auth/api-key/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sneaky", permissions: { project: ["read"] } }),
      })
      expect(key.status).toBe(403)
      expect(await key.json()).toMatchObject({ code: "IMPERSONATED_SESSION_NOT_ALLOWED" })

      const consent = await admin.request("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accept: true }),
      })
      expect(consent.status).toBe(403)
      expect(await consent.json()).toMatchObject({ code: "IMPERSONATED_SESSION_NOT_ALLOWED" })

      const viaApi = await admin.request("/v1/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Sneaky", permissions: { project: ["read"] } }),
      })
      expect(viaApi.status).toBe(403)
      expect(await viaApi.json()).toMatchObject({ error: { code: "FORBIDDEN" } })
    })
  })

  describe("impersonation and the device grant", () => {
    it("an impersonated session cannot approve a device code, so no token is issued", async () => {
      const { userId: ownerId } = await signedUp("Device owner")
      const { b: admin, userId: adminId } = await signedUp("Root device")
      await (await t.auth.$context).adapter.updateMany({
        model: "user",
        where: [{ field: "id", value: adminId }],
        update: { role: "admin" },
      })
      expect((await admin.client.admin.impersonateUser({ userId: ownerId })).error).toBeNull()

      const registered = await t.req("/api/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Device CLI",
          token_endpoint_auth_method: "none",
          grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
        }),
      })
      const clientId = ((await registered.json()) as { client_id: string }).client_id
      const device = await t.req("/api/auth/device/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: clientId, scope: "read offline_access" }),
      })
      const { device_code, user_code } = (await device.json()) as {
        device_code: string
        user_code: string
      }

      const approve = await admin.request("/api/auth/device/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode: user_code }),
      })
      expect(approve.status).toBe(403)
      expect(await approve.json()).toMatchObject({ code: "IMPERSONATED_SESSION_NOT_ALLOWED" })

      // Nothing was approved, so the client is still told to wait.
      const poll = await t.req("/api/auth/oauth2/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code,
          client_id: clientId,
        }),
      })
      expect(poll.status).toBe(400)
      expect(await poll.json()).toMatchObject({ error: "authorization_pending" })
    })
  })

  describe("owner-only single sign-on, SCIM and billing", () => {
    let org: string
    let owner: Awaited<ReturnType<typeof signedUp>>
    const roleUsers: Record<"member" | "viewer" | "admin", ReturnType<typeof open>> = {
      member: open(),
      viewer: open(),
      admin: open(),
    }

    beforeAll(async () => {
      owner = await signedUp("Owner of SSO")
      org = (await whoami(owner.b)).body.organizationId ?? ""
      for (const role of ["member", "viewer", "admin"] as const) {
        const user = await signedUp(`Ruled ${role}`)
        roleUsers[role] = user.b
        await t.auth.api.addMember({
          body: { organizationId: org, userId: user.userId, role },
        })
      }
    })

    const json = (body: unknown) => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })

    const providerBody = (providerId: string) => ({
      providerId,
      issuer: "https://idp.acme.test",
      domain: "acme.test",
      organizationId: org,
      oidcConfig: {
        clientId: "acme-client",
        clientSecret: "acme-secret", // gitleaks:allow
        authorizationEndpoint: "https://idp.acme.test/authorize",
        tokenEndpoint: "https://idp.acme.test/token",
        jwksEndpoint: "https://idp.acme.test/jwks",
        skipDiscovery: true,
      },
    })

    it("lets the owner register an SSO provider for the organization", async () => {
      const res = await owner.b.request("/api/auth/sso/register", json(providerBody("acme-owner")))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ providerId: "acme-owner" })
    })

    it("refuses SSO registration to an admin, a member and a viewer of the same organization", async () => {
      for (const role of ["admin", "member", "viewer"] as const) {
        const res = await roleUsers[role].request(
          "/api/auth/sso/register",
          json(providerBody(`acme-${role}`)),
        )
        expect(res.status, role).toBe(403)
        expect(await res.json(), role).toMatchObject({ code: "ORGANIZATION_OWNER_REQUIRED" })
      }
    })

    it("mints a SCIM token for the owner only, and the token opens the SCIM API", async () => {
      const res = await owner.b.request(
        "/api/auth/scim/generate-token",
        json({ organizationId: org }),
      )
      expect(res.status).toBe(200)
      const { token } = (await res.json()) as { token: string }
      expect(token.length).toBeGreaterThan(20)

      const scim = await owner.b.request("/api/auth/scim/v2/Users", {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(scim.status).toBe(200)
    })

    it("refuses a SCIM token to an admin, a member and a viewer", async () => {
      for (const role of ["admin", "member", "viewer"] as const) {
        const res = await roleUsers[role].request(
          "/api/auth/scim/generate-token",
          json({ organizationId: org }),
        )
        expect(res.status, role).toBe(403)
        expect(await res.json(), role).toMatchObject({ code: "ORGANIZATION_OWNER_REQUIRED" })
      }
    })

    it("refuses a SCIM token for an organization the caller is not in", async () => {
      const res = await roleUsers.member.request(
        "/api/auth/scim/generate-token",
        json({ organizationId: owner.userId }),
      )
      expect(res.status).toBe(403)
    })

    it("with Stripe unset, the billing endpoints are absent", async () => {
      for (const path of ["/api/auth/stripe/webhook", "/api/auth/subscription/upgrade"]) {
        const res = await owner.b.request(path, json({ referenceId: org }))
        expect(res.status, path).toBe(404)
      }
    })
  })

  describe("reserved organization slugs", () => {
    it("refuses a reserved slug on create and on update", async () => {
      const { b } = await signedUp("Owner")
      const explicit = await b.client.organization.create({ name: "Admin area", slug: "admin" })
      expect(explicit.error).toMatchObject({ status: 400, code: "RESERVED_ORGANIZATION_SLUG" })

      const hyphenated = await b.client.organization.create({
        name: "Two Factor",
        slug: "two-factor",
      })
      expect(hyphenated.error).toMatchObject({ status: 400, code: "RESERVED_ORGANIZATION_SLUG" })

      const { data: org, error } = await b.client.organization.create({
        name: "Fine",
        slug: `fine-${n}`,
      })
      expect(error).toBeNull()
      const renamed = await b.client.organization.update({
        organizationId: org?.id ?? "",
        data: { slug: "settings" },
      })
      expect(renamed.error).toMatchObject({ status: 400, code: "RESERVED_ORGANIZATION_SLUG" })
    })
  })

  describe("password breach check (Have I Been Pwned, faked)", () => {
    const BAD_PASSWORD = "Breached-Password-2026"
    const badHash = createHash("sha1").update(BAD_PASSWORD).digest("hex").toUpperCase()
    const realFetch = globalThis.fetch
    let checked = 0
    let t2: Awaited<ReturnType<typeof createTestApp>>

    beforeAll(async () => {
      t2 = await createTestApp([], { breachCheck: true })
      // The k-anonymity range API: only the matching suffix comes back. Everything else is clean.
      vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input)
        if (!url.startsWith("https://api.pwnedpasswords.com/range/")) return realFetch(input, init)
        checked++
        const prefix = url.split("/").pop()
        const body =
          prefix === badHash.slice(0, 5)
            ? `${badHash.slice(5)}:37\r\n0000000000000000000000000000000000000:0\r\n`
            : "0000000000000000000000000000000000000:0\r\n"
        return Promise.resolve(new Response(body, { status: 200 }))
      })
    })
    afterAll(async () => {
      vi.unstubAllGlobals()
      await t2.close()
    })

    it("refuses a breached password at sign-up, with the code the app maps", async () => {
      const b = browser((url, init) => t2.app.request(url, init))
      const { error } = await b.client.signUp.email({
        email: `breach-${++n}@example.com`,
        password: BAD_PASSWORD,
        name: "Ada",
      })
      expect(error).toMatchObject({
        status: 400,
        code: "PASSWORD_COMPROMISED",
        message: "This password has shown up in a known data breach. Choose a different one.",
      })
      expect(checked).toBeGreaterThan(0)
    })

    it("refuses a breached password when changing it, and accepts a clean one", async () => {
      const b = browser((url, init) => t2.app.request(url, init))
      await b.client.signUp.email({
        email: `breach-${++n}@example.com`,
        password: PASSWORD,
        name: "Ada",
      })
      const bad = await b.client.changePassword({
        currentPassword: PASSWORD,
        newPassword: BAD_PASSWORD,
      })
      expect(bad.error).toMatchObject({ code: "PASSWORD_COMPROMISED" })
      const good = await b.client.changePassword({
        currentPassword: PASSWORD,
        newPassword: "a-clean-passphrase",
      })
      expect(good.error).toBeNull()
    })
  })
})

describe("billing with Stripe test-mode keys set", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  beforeAll(async () => {
    t = await createTestApp([], {
      stripe: {
        secretKey: "sk_test_placeholder_for_tests", // gitleaks:allow
        webhookSecret: "whsec_placeholder_for_tests", // gitleaks:allow
        plans: [{ name: "pro", priceId: "price_placeholder_for_tests" }], // gitleaks:allow
      },
    })
  })
  afterAll(() => t.close())

  it("mounts the stripe webhook, which refuses an unsigned request", async () => {
    const res = await t.req("/api/auth/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    expect(res.status).not.toBe(404)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
