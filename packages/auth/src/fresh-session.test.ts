// The fresh-session guard over a real better-auth instance (PGlite): a stale session is refused with
// SESSION_NOT_FRESH on a guarded endpoint, a fresh one passes the guard, and no session passes
// through to the endpoint's own UNAUTHORIZED.
import { createTestDb } from "@starter/db/testing"
import * as schema from "@starter/db/schema"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { twoFactor } from "better-auth/plugins"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { FRESH_AGE_SECONDS, FRESH_SESSION_PATHS, freshSessionGuard, isFresh } from "./fresh-session"

const BASE = "http://localhost:3000"
const PASSWORD = "correct-horse-battery"

describe("isFresh", () => {
  const now = Date.parse("2026-10-18T12:00:00Z")
  const ago = (seconds: number) => new Date(now - seconds * 1000)

  it("is fresh inside the window and stale at and after it", () => {
    expect(isFresh(ago(0), now)).toBe(true)
    expect(isFresh(ago(FRESH_AGE_SECONDS - 1), now)).toBe(true)
    expect(isFresh(ago(FRESH_AGE_SECONDS), now)).toBe(false)
    expect(isFresh(ago(FRESH_AGE_SECONDS * 24), now)).toBe(false)
  })

  it("accepts a string or number creation time", () => {
    expect(isFresh(ago(60).toISOString(), now)).toBe(true)
    expect(isFresh(ago(FRESH_AGE_SECONDS + 60).getTime(), now)).toBe(false)
  })

  it("uses one hour", () => {
    expect(FRESH_AGE_SECONDS).toBe(3600)
  })
})

// A small instance with the guard, the two-factor plugin (one guarded endpoint to call) and
// better-auth's own freshAge, so its endpoints agree with the window.
const instance = (db: Parameters<typeof drizzleAdapter>[0]) =>
  betterAuth({
    baseURL: BASE,
    secret: "a-test-secret-that-is-long-enough-123456", // gitleaks:allow
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: true },
    session: { freshAge: FRESH_AGE_SECONDS },
    plugins: [twoFactor(), freshSessionGuard],
  })

describe("freshSessionGuard", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>
  let auth: ReturnType<typeof instance>

  beforeAll(async () => {
    t = await createTestDb()
    auth = instance(t.db)
    await auth.$context
  })
  afterAll(() => t.close())

  /** Sign up, then backdate the session's createdAt by `ageSeconds`. Returns its headers. */
  async function signIn(email: string, ageSeconds: number) {
    const res = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Person" },
      returnHeaders: true,
    })
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
    const adapter = (await auth.$context).adapter
    await adapter.update({
      model: "session",
      where: [{ field: "userId", value: res.response.user.id }],
      update: { createdAt: new Date(Date.now() - ageSeconds * 1000) },
    })
    return new Headers({ cookie })
  }

  // A guarded endpoint with a clear outcome: enabling two-factor needs the password, so a fresh
  // session that passes the guard gets INVALID_PASSWORD, and a stale one never gets that far.
  const enable = (headers?: Headers) =>
    auth.api.enableTwoFactor({ headers, body: { password: "wrong-password" } })

  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise
      return null
    } catch (e) {
      return (e as { body?: { code?: string } }).body?.code ?? null
    }
  }

  it("refuses a stale session with SESSION_NOT_FRESH", async () => {
    const headers = await signIn("stale@example.com", FRESH_AGE_SECONDS + 60)
    expect(await codeOf(enable(headers))).toBe("SESSION_NOT_FRESH")
  })

  it("lets a fresh session through to the endpoint", async () => {
    const headers = await signIn("fresh@example.com", 60)
    expect(await codeOf(enable(headers))).toBe("INVALID_PASSWORD")
  })

  it("passes a request with no session to the endpoint, which answers UNAUTHORIZED", async () => {
    expect(await codeOf(enable())).toBe("UNAUTHORIZED")
  })

  it("lists each sensitive path once", () => {
    expect(new Set(FRESH_SESSION_PATHS).size).toBe(FRESH_SESSION_PATHS.length)
  })
})
