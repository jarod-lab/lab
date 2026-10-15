// Provisional signup: the key works at once, the claim email goes out once, the limits hold, and an
// existing email is refused without revealing more than that it exists.
import { createTestDb } from "@starter/db/testing"
import { AppError } from "@starter/errors"
import { describe, expect, it } from "vitest"
import { createAuth } from "./index"
import { resolvePrincipal } from "./principal"
import { isClaimed, provisionalSignup, SIGNUP_LIMITS } from "./signup"

const BASE = "http://localhost:3000"
const AUDIENCE = `${BASE}/mcp`

interface SentEmail {
  to: string
  subject: string
  link: string
}

async function setup() {
  const t = await createTestDb()
  // Stands in for SES: records who got what, and the first app link in the body.
  const outbox: SentEmail[] = []
  const ses = {
    send: async (command: { input: unknown }) => {
      const raw = JSON.stringify(command.input)
      const input = command.input as { Destination?: { ToAddresses?: string[] } }
      const subject = /"Subject":\{"Data":"([^"]*)"/.exec(raw)?.[1] ?? ""
      const links = raw.match(/https?:\/\/[^"\s<>\\]+/g) ?? []
      const link = (links.find((l) => l.startsWith(BASE)) ?? "").replaceAll("&amp;", "&")
      outbox.push({ to: input.Destination?.ToAddresses?.[0] ?? "", subject, link })
      return { MessageId: `test-${outbox.length}`, $metadata: { requestId: "test" } }
    },
  }
  const auth = createAuth({
    db: t.db,
    secret: "a-test-secret-that-is-long-enough-123456", // gitleaks:allow
    baseURL: BASE,
    emailFrom: "Test <auth@example.com>",
    oauthResources: [BASE, AUDIENCE],
    ses: { client: ses },
    onEmailError: (error) => {
      throw error
    },
  })
  // better-auth initialises asynchronously (it seeds the OAuth resources); wait for it, or the
  // database can close under it.
  await auth.$context
  return { t, auth, outbox }
}

describe("provisionalSignup", () => {
  it("creates an unverified user, a personal org and a key that authenticates", async () => {
    const { t, auth } = await setup()
    try {
      const signup = await provisionalSignup(auth, {
        email: "Agent@Example.com",
        name: "Agent",
        ip: "203.0.113.1",
      })
      expect(signup.apiKey.startsWith("sk_")).toBe(true)

      const principal = await resolvePrincipal(auth, new Headers({ "x-api-key": signup.apiKey }), {
        audience: AUDIENCE,
      })
      expect(principal).toMatchObject({
        organizationId: signup.organizationId,
        via: "api-key",
      })
      // The key can do the project operations, and nothing about the org's members.
      const granted = principal?.grants[0] ?? {}
      expect(granted).toMatchObject({ project: ["read", "create", "update", "delete"] })
      expect(granted).not.toHaveProperty("member")

      const ctx = await auth.$context
      const user = await ctx.adapter.findOne<{ email: string; emailVerified: boolean }>({
        model: "user",
        where: [{ field: "id", value: signup.userId }],
      })
      expect(user).toMatchObject({ email: "agent@example.com", emailVerified: false })
      expect(isClaimed(user ?? { emailVerified: false })).toBe(false)
    } finally {
      await t.close()
    }
  })

  it("sends one claim email, a password reset link that lands on /claim", async () => {
    const { t, auth, outbox } = await setup()
    try {
      await provisionalSignup(auth, { email: "claim@example.org", ip: "203.0.113.2" })
      await waitFor(() => expect(outbox).toHaveLength(1))
      expect(outbox[0]?.to).toBe("claim@example.org")
      expect(outbox[0]?.link).toMatch(/^http:\/\/localhost:3000\/api\/auth\/reset-password\//)
      expect(outbox[0]?.link).toContain(`callbackURL=${encodeURIComponent(`${BASE}/claim`)}`)
    } finally {
      await t.close()
    }
  })

  it("is claimed once the emailed link sets a password", async () => {
    const { t, auth, outbox } = await setup()
    try {
      const signup = await provisionalSignup(auth, {
        email: "later@example.org",
        ip: "203.0.113.3",
      })
      await waitFor(() => expect(outbox).toHaveLength(1))
      const token = /reset-password\/([^?]+)/.exec(outbox[0]?.link ?? "")?.[1] ?? ""
      expect(token).toBeTruthy()

      await auth.api.resetPassword({ body: { newPassword: "a-claimed-passphrase", token } })

      const ctx = await auth.$context
      const user = await ctx.adapter.findOne<{ id: string; emailVerified: boolean }>({
        model: "user",
        where: [{ field: "id", value: signup.userId }],
      })
      expect(isClaimed(user ?? { emailVerified: false })).toBe(true)
      // The key keeps working: a claim doesn't rotate it.
      expect(
        await resolvePrincipal(auth, new Headers({ "x-api-key": signup.apiKey }), {
          audience: AUDIENCE,
        }),
      ).not.toBeNull()
    } finally {
      await t.close()
    }
  })

  it("refuses an existing email with CONFLICT, without saying more than that it exists", async () => {
    const { t, auth } = await setup()
    try {
      await provisionalSignup(auth, { email: "taken@example.org", ip: "203.0.113.4" })
      const error = await provisionalSignup(auth, {
        email: "taken@example.org",
        ip: "203.0.113.5",
      }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe("CONFLICT")
      expect((error as AppError).message).toBe(
        "An account already exists for this email. Use sign-in.",
      )
    } finally {
      await t.close()
    }
  })

  it("rejects an address that isn't an email", async () => {
    const { t, auth } = await setup()
    try {
      const error = await provisionalSignup(auth, { email: "nope", ip: "203.0.113.6" }).catch(
        (e: unknown) => e,
      )
      expect((error as AppError).code).toBe("BAD_REQUEST")
    } finally {
      await t.close()
    }
  })

  it(`allows ${SIGNUP_LIMITS.perIpPerHour} attempts per IP per hour, then rate limits`, async () => {
    const { t, auth } = await setup()
    try {
      for (let i = 0; i < SIGNUP_LIMITS.perIpPerHour; i++) {
        await provisionalSignup(auth, { email: `ip${i}@site${i}.test`, ip: "198.51.100.9" })
      }
      const error = (await provisionalSignup(auth, {
        email: "one-more@site-x.test",
        ip: "198.51.100.9",
      }).catch((e: unknown) => e)) as AppError
      expect(error.code).toBe("RATE_LIMITED")
      expect(error.context).toEqual({ retryAfter: 3600 })
      // Another network is unaffected.
      await provisionalSignup(auth, { email: "elsewhere@site-y.test", ip: "198.51.100.10" })
    } finally {
      await t.close()
    }
  }, 60_000)

  it(`allows ${SIGNUP_LIMITS.perDomainPerDay} signups per email domain per day, then rate limits`, async () => {
    const { t, auth } = await setup()
    try {
      for (let i = 0; i < SIGNUP_LIMITS.perDomainPerDay; i++) {
        await provisionalSignup(auth, { email: `a${i}@shared.test`, ip: `192.0.2.${i + 1}` })
      }
      const error = (await provisionalSignup(auth, {
        email: "over@shared.test",
        ip: "192.0.2.250",
      }).catch((e: unknown) => e)) as AppError
      expect(error.code).toBe("RATE_LIMITED")
      expect(error.context).toEqual({ retryAfter: 86_400 })
      // Other domains are unaffected.
      await provisionalSignup(auth, { email: "fine@other.test", ip: "192.0.2.251" })
    } finally {
      await t.close()
    }
  }, 120_000)
})

/** Email goes out in the background after the request returns, so poll for it. */
async function waitFor(assertion: () => void, timeoutMs = 5_000) {
  const started = Date.now()
  for (;;) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() - started > timeoutMs) throw error
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
}
