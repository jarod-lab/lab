import { describe, expect, it, vi } from "vitest"

describe("env", () => {
  it("fails fast on missing variables", async () => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_VALIDATION", "")
    vi.stubEnv("DATABASE_URL", "")
    await expect(import("./index")).rejects.toThrow(/Invalid environment variables/)
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
})
