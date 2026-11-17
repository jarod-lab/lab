import { afterEach, describe, expect, test, vi } from "vitest"
import { MODELS, modelFor, offlineMode } from "#lib/models.js"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("offline mode", () => {
  test("is off by default and the roles keep their gateway ids", () => {
    expect(offlineMode()).toBe(false)
    expect(modelFor("orchestrator")).toBe(MODELS.orchestrator)
    expect(modelFor("reviewer")).toBe(MODELS.reviewer)
  })

  test("AGENT_OFFLINE=1 swaps in a scripted model, which is not a gateway id", () => {
    vi.stubEnv("AGENT_OFFLINE", "1")
    expect(offlineMode()).toBe(true)
    expect(typeof modelFor("orchestrator")).not.toBe("string")
  })

  test("AGENT_OFFLINE in production refuses to start: scripted models never answer real people", () => {
    vi.stubEnv("AGENT_OFFLINE", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(() => offlineMode()).toThrow(/production/)
    expect(() => modelFor("orchestrator")).toThrow(/production/)
  })

  test("only the value 1 turns it on", () => {
    vi.stubEnv("AGENT_OFFLINE", "true")
    expect(offlineMode()).toBe(false)
  })
})
