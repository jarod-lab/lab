import { afterEach, describe, expect, it, vi } from "vitest"
import { createLogger } from "./index"

function capture(level = "info") {
  const lines: Record<string, unknown>[] = []
  const logger = createLogger({
    name: "test",
    level,
    destination: { write: (s: string) => void lines.push(JSON.parse(s)) },
  })
  return { logger, lines }
}

describe("createLogger", () => {
  it("writes structured JSON with the logger name", () => {
    const { logger, lines } = capture()
    logger.info({ userId: "u1" }, "signed in")
    expect(lines[0]).toMatchObject({ name: "test", userId: "u1", msg: "signed in" })
  })

  it("redacts secrets at the top level, nested, and in headers", () => {
    const { logger, lines } = capture()
    logger.info({
      password: "hunter2",
      user: { token: "abc", email: "a@example.com" },
      req: { headers: { authorization: "Bearer xyz", host: "x" } },
    })
    const line = JSON.stringify(lines[0])
    expect(line).not.toMatch(/hunter2|abc"|Bearer xyz/)
    expect(lines[0]).toMatchObject({
      password: "[Redacted]",
      user: { token: "[Redacted]", email: "a@example.com" },
      req: { headers: { authorization: "[Redacted]", host: "x" } },
    })
  })

  it("serialises errors with the cause folded into the message", () => {
    const { logger, lines } = capture()
    logger.error({ err: new Error("outer", { cause: new Error("inner") }) }, "failed")
    expect(lines[0]).toMatchObject({ err: { type: "Error", message: "outer: inner" } })
  })

  it("respects the level", () => {
    const { logger, lines } = capture("warn")
    logger.info("hidden")
    logger.warn("shown")
    expect(lines.map((l) => l.msg)).toEqual(["shown"])
  })
})

describe("default level", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("is silent under NODE_ENV=test", () => {
    vi.stubEnv("LOG_LEVEL", "")
    expect(createLogger().level).toBe("silent")
  })

  it("is info outside test", () => {
    vi.stubEnv("LOG_LEVEL", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(createLogger().level).toBe("info")
  })

  it("LOG_LEVEL wins over the environment default", () => {
    vi.stubEnv("LOG_LEVEL", "debug")
    expect(createLogger().level).toBe("debug")
  })
})
