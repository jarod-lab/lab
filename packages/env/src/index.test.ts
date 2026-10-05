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
})
