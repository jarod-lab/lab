import { describe, expect, it } from "vitest"
import {
  CLIENT_IP_HEADER,
  GLOBAL_RATE_LIMIT,
  STRICT_RULES,
  authIpAddress,
  authRateLimit,
} from "./rate-limit"

describe("authRateLimit", () => {
  it("is disabled when passed false", () => {
    expect(authRateLimit(false)).toEqual({ enabled: false })
  })

  it("is enabled, database-backed, with a global window and max", () => {
    const config = authRateLimit()
    expect(config).toMatchObject({ enabled: true, storage: "database", window: 60, max: 120 })
  })

  it("takes the global window and max from the options", () => {
    expect(authRateLimit({ window: 30, max: 50 })).toMatchObject({ window: 30, max: 50 })
  })

  it("gives every listed sensitive path a rule stricter than the global one", () => {
    const { customRules } = authRateLimit()
    const { window, max } = GLOBAL_RATE_LIMIT
    const paths = [
      "/sign-in/email",
      "/sign-in/magic-link",
      "/magic-link/verify",
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
      "/two-factor/send-otp",
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/sign-up/email",
      "/passkey/verify-authentication",
      "/sign-in/sso",
      "/change-email",
      "/change-password",
    ]
    for (const path of paths) {
      const rule = customRules?.[path]
      expect(rule, path).toBeDefined()
      if (typeof rule !== "object") throw new Error(`${path} has no static rule`)
      // Stricter: fewer requests, in a window at least as long as the global one.
      expect(rule.max, path).toBeLessThan(max)
      expect(rule.window, path).toBeGreaterThanOrEqual(window)
    }
  })

  it("has no rule for /forget-password, which 1.7.7 does not expose", () => {
    expect(STRICT_RULES).not.toHaveProperty("/forget-password")
  })

  it("lets the options override or add a rule", () => {
    const config = authRateLimit({
      rules: { "/sign-in/email": { window: 10, max: 1 }, "/x": { window: 1, max: 1 } },
    })
    expect(config.customRules).toMatchObject({
      "/sign-in/email": { window: 10, max: 1 },
      "/x": { window: 1, max: 1 },
      "/reset-password": STRICT_RULES["/reset-password"],
    })
  })
})

describe("authIpAddress", () => {
  it("reads the client address only from the header apps/api sets", () => {
    expect(authIpAddress).toEqual({ ipAddressHeaders: [CLIENT_IP_HEADER] })
    expect(CLIENT_IP_HEADER).toBe("x-starter-client-ip")
  })
})
