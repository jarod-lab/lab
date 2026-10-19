// The account rules (account-plugin.ts), login-method resolution, security summary and account
// notices, against a real auth instance on PGlite. The HTTP flows are in apps/api/auth-flows.test.ts;
// these pin the rules and the helpers so a change in auth's own tests can't hide one.
import { wrapsAuthEmails } from "@wraps.dev/better-auth"
import { SignJWT } from "jose"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  ACTIVE_SUBSCRIPTION_CODE,
  LAST_SIGN_IN_METHOD_CODE,
  OWNS_ORGANIZATION_CODE,
} from "./constants"
import {
  assertCanDelete,
  blockingOrganizations,
  changeRequestOf,
  removePersonalOrganization,
} from "./account-plugin"
import { BASE, createTestAuth } from "./auth.test.helpers"
import { type LoginContext, methodOfPath, signInOf } from "./login-method"
import { personalSlug } from "./membership"
import { createNotices } from "./notices"

const SECRET = "a-test-secret-that-is-long-enough-123456" // gitleaks:allow

describe("billing: a live subscription blocks deletion", () => {
  it("refuses while the personal organization has a live subscription, and not once it's cancelled", async () => {
    const h = await createTestAuth({
      // The subscription model is registered only with a plan configured.
      stripe: {
        secretKey: "sk_test_placeholder", // gitleaks:allow
        webhookSecret: "whsec_placeholder",
        plans: [{ name: "pro", priceId: "price_placeholder" }],
      },
    })
    try {
      const db = (await h.auth.$context).adapter
      const user = await h.signUp("Billed")
      const sub = await db.create<Record<string, unknown>, { id: string }>({
        model: "subscription",
        data: { plan: "pro", referenceId: user.orgId, status: "active" },
      })
      await expect(assertCanDelete(db, user.userId, true)).rejects.toMatchObject({
        body: { code: ACTIVE_SUBSCRIPTION_CODE },
      })
      await db.updateMany({
        model: "subscription",
        where: [{ field: "id", value: sub.id }],
        update: { status: "canceled" },
      })
      await expect(assertCanDelete(db, user.userId, true)).resolves.toBeUndefined()
      await removePersonalOrganization(db, user.userId, true)
      expect(
        await db.findOne({ model: "organization", where: [{ field: "id", value: user.orgId }] }),
      ).toBeNull()
    } finally {
      await h.close()
    }
  })
})

describe("account rules", () => {
  let h: Awaited<ReturnType<typeof createTestAuth>>
  let db: Awaited<ReturnType<typeof createAdapter>>
  const createAdapter = async (auth: Awaited<ReturnType<typeof createTestAuth>>["auth"]) =>
    (await auth.$context).adapter

  beforeAll(async () => {
    h = await createTestAuth()
    db = await createAdapter(h.auth)
  })
  afterAll(() => h.close())

  /** Calls an endpoint over the handler, as a browser would: cookie and Origin, JSON body. */
  const post = (path: string, cookie: string, body: unknown) =>
    h.auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie, origin: BASE },
        body: JSON.stringify(body),
      }),
    )

  describe("organizations a deletion would leave behind", () => {
    it("names nothing for a user with only a personal organization", async () => {
      const { userId } = await h.signUp("Solo")
      expect(await blockingOrganizations(db, userId)).toEqual([])
      await expect(assertCanDelete(db, userId, false)).resolves.toBeUndefined()
    })

    it("names the personal organization once another member joins it", async () => {
      const owner = await h.signUp("Owned")
      const guest = await h.signUp("Guest")
      await h.addMember(owner.orgId, guest.userId, "member")
      const blockers = await blockingOrganizations(db, owner.userId)
      expect(blockers.map((o) => o.id)).toEqual([owner.orgId])
      await expect(assertCanDelete(db, owner.userId, false)).rejects.toMatchObject({
        body: { code: OWNS_ORGANIZATION_CODE },
      })
    })

    it("names an owned organization that is not the personal one, even alone", async () => {
      const user = await h.signUp("Founder")
      const org = await db.create<{ name: string; slug: string; createdAt: Date }, { id: string }>({
        model: "organization",
        data: { name: "Founded Co", slug: `founded-${user.userId}`, createdAt: new Date() },
      })
      await db.create({
        model: "member",
        data: { organizationId: org.id, userId: user.userId, role: "owner", createdAt: new Date() },
      })
      expect((await blockingOrganizations(db, user.userId)).map((o) => o.name)).toContain(
        "Founded Co",
      )
    })

    it("removes the personal organization and its keys", async () => {
      const user = await h.signUp("Leaver")
      await removePersonalOrganization(db, user.userId, false)
      const org = await db.findOne({
        model: "organization",
        where: [{ field: "slug", value: personalSlug(user.userId) }],
      })
      expect(org).toBeNull()
    })
  })

  describe("changing and unlinking through the handler", () => {
    it("refuses a deletion request from a user who owns a shared organization", async () => {
      const owner = await h.signUp("Shared")
      const guest = await h.signUp("Guest2")
      await h.addMember(owner.orgId, guest.userId, "member")
      const res = await post("/delete-user", owner.cookie, {})
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: OWNS_ORGANIZATION_CODE })
    })

    it("refuses to unlink the only account when there is no passkey", async () => {
      const user = await h.signUp("Only")
      const accounts = await db.findMany<{ id: string; providerId: string }>({
        model: "account",
        where: [{ field: "userId", value: user.userId }],
      })
      const credential = accounts.find((a) => a.providerId === "credential")
      const res = await post("/unlink-account", user.cookie, { accountId: credential?.id })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: LAST_SIGN_IN_METHOD_CODE })
    })

    it("leaves an unknown account id to better-auth", async () => {
      const user = await h.signUp("Unknown")
      const res = await post("/unlink-account", user.cookie, { accountId: "no-such-account" })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: "ACCOUNT_NOT_FOUND" })
    })

    it("tells the old address when a change is requested, and sends nothing for a refused one", async () => {
      const user = await h.signUp("Mover")
      const before = h.outbox.length
      const ok = await post("/change-email", user.cookie, {
        newEmail: `new-${user.userId}@example.com`,
      })
      expect(ok.status).toBe(200)
      const told = h.outbox.slice(before).filter((m) => m.to === user.email)
      expect(told).toHaveLength(1)

      const same = await post("/change-email", user.cookie, { newEmail: user.email })
      expect(same.status).toBe(400)
      expect(h.outbox.slice(before).filter((m) => m.to === user.email)).toHaveLength(1)
    })
  })

  describe("which method a request signed in with", () => {
    it("reads the provider from a social callback, and the sso and passkey paths", () => {
      expect(methodOfPath({ path: "/callback/github" })).toBe("github")
      expect(methodOfPath({ path: "/callback/x", params: { id: "google" } })).toBe("google")
      expect(methodOfPath({ path: "/sso/callback/acme" })).toBe("sso")
      expect(methodOfPath({ path: "/passkey/verify-authentication" })).toBe("passkey")
      expect(methodOfPath({ path: "/magic-link/verify" })).toBe("magic-link")
      expect(methodOfPath({ path: "/sign-in/email" })).toBe("email")
      expect(methodOfPath({ path: "/get-session" })).toBeNull()
      expect(methodOfPath({})).toBeNull()
    })

    it("records two-factor, and the method of the first step, for a completed code", async () => {
      expect(await signInOf(null)).toEqual({ loginMethod: null, loginTwoFactor: false })
      const challenge = (method: string | undefined): LoginContext => ({
        path: "/two-factor/verify-totp",
        getSignedCookie: async () => "2fa-x",
        context: {
          secret: SECRET,
          createAuthCookie: () => ({ name: "two_factor" }),
          internalAdapter: {
            findVerificationValue: async (id) =>
              method && id === "login-method-2fa-x" ? { value: method } : null,
          },
        },
      })
      expect(await signInOf(challenge("magic-link"))).toEqual({
        loginMethod: "magic-link",
        loginTwoFactor: true,
      })
      expect(await signInOf(challenge(undefined))).toEqual({
        loginMethod: "email",
        loginTwoFactor: true,
      })
      expect(await signInOf({ path: "/two-factor/verify-backup-code" })).toEqual({
        loginMethod: "email",
        loginTwoFactor: true,
      })
    })
  })

  describe("the security summary and account emails", () => {
    it("reports the password change and no backup codes for an account without two-factor", async () => {
      const user = await h.signUp("Summary")
      const summary = await h.auth.api.securitySummary({
        headers: new Headers({ cookie: user.cookie }),
      })
      expect(summary).toMatchObject({
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
        backupCodesRemaining: null,
      })
      expect(summary.passwordChangedAt).toBeTruthy()
    })

    it("recognises only a token that asks for a change of address", async () => {
      const key = new TextEncoder().encode(SECRET)
      const sign = (payload: Record<string, unknown>) =>
        new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(key)
      expect(changeRequestOf("not-a-token")).toBeNull()
      expect(
        changeRequestOf(
          await sign({ email: "a@example.com", updateTo: "b@example.com", requestType: "other" }),
        ),
      ).toBeNull()
      expect(
        changeRequestOf(
          await sign({
            email: "a@example.com",
            updateTo: "b@example.com",
            requestType: "change-email-verification",
          }),
        ),
      ).toEqual({ oldEmail: "a@example.com" })
    })

    it("sends each account email, and reports a failed send without throwing", async () => {
      const sent: string[] = []
      const emails = wrapsAuthEmails({
        from: "Test <auth@example.com>",
        ses: {
          client: {
            send: async (command: { input: unknown }) => {
              sent.push(JSON.stringify(command.input))
              return { MessageId: "m", $metadata: { requestId: "r" } }
            },
          },
        },
      })
      const notices = createNotices({ appName: "Test", send: emails.send })
      await notices.emailChangeConfirmation({
        to: "new@example.com",
        oldEmail: "old@example.com",
        url: `${BASE}/verify`,
      })
      await notices.emailChangeRequested({ to: "old@example.com", newEmail: "new@example.com" })
      await notices.deleteAccountConfirmation({ to: "old@example.com", url: `${BASE}/delete` })
      expect(sent.join("\n")).toMatch(/Confirm your new email address/)
      expect(sent.join("\n")).toMatch(/A new email address was requested/)
      expect(sent.join("\n")).toMatch(/Confirm deleting your Test account/)

      const errors: Error[] = []
      const down = wrapsAuthEmails({
        from: "Test <auth@example.com>",
        onError: (e) => errors.push(e),
        ses: {
          client: {
            send: async () => {
              throw new Error("ses down")
            },
          },
        },
      })
      const failing = createNotices({ appName: "Test", send: down.send })
      await failing.deleteAccountConfirmation({ to: "x@example.com", url: `${BASE}/delete` })
      expect(errors.map((e) => e.message)).toEqual(["ses down"])
    })
  })
})
