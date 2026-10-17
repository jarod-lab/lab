import { describe, expect, it, vi } from "vitest"

/** Variables the tests below set themselves, and expect unset otherwise. */
const OPTIONAL_UNDER_TEST = [
  "WEB_ORIGINS",
  "DEV_MAIL_SINK",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PLANS",
]

describe("env", () => {
  it("fails fast on missing variables", async () => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_VALIDATION", "")
    vi.stubEnv("DATABASE_URL", "")
    await expect(import("./index")).rejects.toThrow(/Invalid environment variables/)
  })

  it("still validates when SKIP_ENV_VALIDATION is set to false or 0", async () => {
    for (const value of ["false", "0"]) {
      vi.resetModules()
      vi.stubEnv("SKIP_ENV_VALIDATION", value)
      vi.stubEnv("DATABASE_URL", "")
      await expect(import("./index")).rejects.toThrow(/Invalid environment variables/)
    }
  })

  it("skips validation when SKIP_ENV_VALIDATION is 1 or true", async () => {
    for (const value of ["1", "true"]) {
      vi.resetModules()
      vi.stubEnv("SKIP_ENV_VALIDATION", value)
      vi.stubEnv("DATABASE_URL", "")
      await expect(import("./index")).resolves.toHaveProperty("env")
    }
  })

  it("parses a valid environment", async () => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_VALIDATION", "")
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32))
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
    vi.stubEnv("EMAIL_FROM", "App <auth@example.com>")
    const { env } = await import("./index")
    expect(env.BETTER_AUTH_URL).toBe("http://localhost:3000")
  })

  it("defaults the metering limits and proxy trust, and reads the web build directory", async () => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_VALIDATION", "")
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32))
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
    vi.stubEnv("EMAIL_FROM", "App <auth@example.com>")
    vi.stubEnv("ORG_DAILY_REQUEST_LIMIT", "")
    vi.stubEnv("UNCLAIMED_ORG_DAILY_REQUEST_LIMIT", "")
    vi.stubEnv("TRUST_PROXY", "")
    vi.stubEnv("WEB_DIST_DIR", "/srv/web")
    const { env } = await import("./index")
    expect(env.ORG_DAILY_REQUEST_LIMIT).toBe(10_000)
    expect(env.UNCLAIMED_ORG_DAILY_REQUEST_LIMIT).toBe(500)
    expect(env.TRUST_PROXY).toBe(false)
    expect(env.WEB_DIST_DIR).toBe("/srv/web")
  })

  it("parses explicit limits and TRUST_PROXY=true", async () => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_VALIDATION", "")
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32))
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
    vi.stubEnv("EMAIL_FROM", "App <auth@example.com>")
    vi.stubEnv("ORG_DAILY_REQUEST_LIMIT", "25000")
    vi.stubEnv("UNCLAIMED_ORG_DAILY_REQUEST_LIMIT", "50")
    vi.stubEnv("TRUST_PROXY", "true")
    const { env } = await import("./index")
    expect(env).toMatchObject({
      ORG_DAILY_REQUEST_LIMIT: 25_000,
      UNCLAIMED_ORG_DAILY_REQUEST_LIMIT: 50,
      TRUST_PROXY: true,
    })
  })

  describe("dev mail sink and Stripe (both optional)", () => {
    const base = () => {
      vi.unstubAllEnvs()
      vi.resetModules()
      vi.stubEnv("SKIP_ENV_VALIDATION", "")
      vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
      vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32))
      vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
      vi.stubEnv("EMAIL_FROM", "App <auth@example.com>")
      // Unset whatever the developer's .env (loaded by mise) sets for these.
      for (const name of OPTIONAL_UNDER_TEST) vi.stubEnv(name, "")
    }

    it("leaves the dev mail sink and billing off when unset", async () => {
      base()
      const { env } = await import("./index")
      expect(env.DEV_MAIL_SINK).toBeUndefined()
      expect(env.STRIPE_SECRET_KEY).toBeUndefined()
    })

    it("allows the dev mail sink outside production", async () => {
      base()
      vi.stubEnv("NODE_ENV", "development")
      vi.stubEnv("DEV_MAIL_SINK", "true")
      const { env } = await import("./index")
      expect(env.DEV_MAIL_SINK).toBe(true)
    })

    it("refuses the dev mail sink when NODE_ENV is production", async () => {
      base()
      vi.stubEnv("NODE_ENV", "production")
      vi.stubEnv("DEV_MAIL_SINK", "true")
      await expect(import("./index")).rejects.toThrow(
        /DEV_MAIL_SINK is for development and e2e only/,
      )
    })

    it("refuses the dev mail sink when NODE_ENV is unset (fails closed)", async () => {
      base()
      vi.stubEnv("NODE_ENV", undefined)
      vi.stubEnv("DEV_MAIL_SINK", "true")
      await expect(import("./index")).rejects.toThrow(
        /DEV_MAIL_SINK is for development and e2e only/,
      )
    })

    it("accepts a Stripe test-mode key", async () => {
      base()
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder") // gitleaks:allow
      const { env } = await import("./index")
      expect(env.STRIPE_SECRET_KEY).toBe("sk_test_placeholder") // gitleaks:allow
    })

    it("refuses a Stripe live-mode key at startup, with the reason", async () => {
      base()
      vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_placeholder") // gitleaks:allow
      await expect(import("./index")).rejects.toThrow(/must be a Stripe test-mode key \(sk_test_/)
    })
  })

  describe("WEB_ORIGINS", () => {
    const base = () => {
      vi.unstubAllEnvs()
      vi.resetModules()
      vi.stubEnv("SKIP_ENV_VALIDATION", "")
      vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
      vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32))
      vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000")
      vi.stubEnv("EMAIL_FROM", "App <auth@example.com>")
      // Unset whatever the developer's .env (loaded by mise) sets for these.
      for (const name of OPTIONAL_UNDER_TEST) vi.stubEnv(name, "")
    }

    it("defaults to no extra origins", async () => {
      base()
      const { env } = await import("./index")
      expect(env.WEB_ORIGINS).toEqual([])
    })

    it("parses a comma-separated list of bare origins", async () => {
      base()
      vi.stubEnv("WEB_ORIGINS", "https://web.localhost, http://127.0.0.1:33195")
      const { env } = await import("./index")
      expect(env.WEB_ORIGINS).toEqual(["https://web.localhost", "http://127.0.0.1:33195"])
    })

    it("refuses anything that is not a bare http(s) origin", async () => {
      for (const value of [
        "web.localhost",
        "ftp://web.localhost",
        "https://web.localhost/sign-in",
        "https://web.localhost/",
        "https://web.localhost,",
      ]) {
        base()
        vi.stubEnv("WEB_ORIGINS", value)
        await expect(import("./index")).rejects.toThrow(/Invalid environment variables/)
      }
    })
  })
})
