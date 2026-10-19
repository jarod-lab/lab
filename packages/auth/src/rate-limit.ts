import type { BetterAuthOptions } from "better-auth"

/**
 * The header better-auth reads the client address from. apps/api sets it from the address it trusts
 * (clientIp) and drops any copy a client sent, so a client cannot choose its own bucket.
 */
export const CLIENT_IP_HEADER = "x-starter-client-ip"

/** better-auth's `advanced.ipAddress`: one trusted header, which carries one address. */
export const authIpAddress = {
  ipAddressHeaders: [CLIENT_IP_HEADER],
} satisfies NonNullable<NonNullable<BetterAuthOptions["advanced"]>["ipAddress"]>

/** A rule's window is in seconds (better-auth's unit), `max` requests per window. */
export interface RateRule {
  window: number
  max: number
}

/** The global window (seconds) and max for auth endpoints without a rule of their own. */
export const GLOBAL_RATE_LIMIT = { window: 60, max: 120 } as const

export interface AuthRateLimitOptions {
  /** The window for every auth endpoint without a rule of its own (seconds). */
  window?: number
  /** Requests per window for every auth endpoint without a rule of its own. */
  max?: number
  /** Overrides or adds per-path rules, keyed by the path under /api/auth. */
  rules?: Record<string, RateRule>
}

/**
 * Limits for the endpoints that check a credential, send mail or spend a one-time code. better-auth
 * keys each rule on client address and path, so the limit for one path does not share a count with
 * another. Paths are the 1.7.7 endpoints (rate-limit.test.ts checks the list).
 */
export const STRICT_RULES = {
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-in/magic-link": { window: 300, max: 5 },
  "/magic-link/verify": { window: 60, max: 10 },
  "/two-factor/verify-totp": { window: 60, max: 5 },
  "/two-factor/verify-backup-code": { window: 300, max: 5 },
  "/two-factor/send-otp": { window: 300, max: 3 },
  "/request-password-reset": { window: 300, max: 3 },
  "/reset-password": { window: 300, max: 5 },
  "/send-verification-email": { window: 300, max: 3 },
  "/sign-up/email": { window: 300, max: 5 },
  "/passkey/verify-authentication": { window: 60, max: 10 },
  "/sign-in/sso": { window: 60, max: 10 },
  "/change-email": { window: 300, max: 5 },
  "/change-password": { window: 300, max: 5 },
} satisfies Record<string, RateRule>

type RateLimitConfig = NonNullable<BetterAuthOptions["rateLimit"]>

/**
 * better-auth's `rateLimit` option. `false` turns the limiter off. Otherwise it is on, stored in the
 * `rateLimit` table (storage "database"), so every instance shares the counts.
 */
export function authRateLimit(opts?: false | AuthRateLimitOptions): RateLimitConfig {
  if (opts === false) return { enabled: false }
  return {
    enabled: true,
    storage: "database",
    window: opts?.window ?? GLOBAL_RATE_LIMIT.window,
    max: opts?.max ?? GLOBAL_RATE_LIMIT.max,
    customRules: { ...STRICT_RULES, ...opts?.rules },
  }
}
