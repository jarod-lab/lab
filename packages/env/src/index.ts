import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Single source of truth for environment variables. Keep `.env.example` in sync.
 * Validation runs on first import; set SKIP_ENV_VALIDATION=1 (or true) for builds/tests that don't need it.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    EMAIL_FROM: z.string().min(1),
    WRAPS_API_KEY: z.string().min(1).optional(),
    /** GitHub OAuth app. The "Continue with GitHub" option appears only when both are set. */
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    /** Google OAuth client. The "Continue with Google" option appears only when both are set. */
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    PORT: z.coerce.number().int().positive().optional(),
    /** Set by portless under `pnpm dev`: the app's https://<name>.localhost URL. */
    PORTLESS_URL: z.url().optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    /** Requests per organization per UTC day, for an organization whose owner has verified the email. */
    ORG_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(10_000),
    /** Requests per organization per UTC day while the owner's email is unverified (provisional signups). */
    UNCLAIMED_ORG_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(500),
    /** Trust X-Forwarded-For for the client IP (signup limits). Only when a proxy overwrites that header. */
    TRUST_PROXY: z.stringbool().default(false),
    /**
     * Vendors whose own status pages `GET /status` reports (never pinged by /health). Comma-separated
     * `Name=https://status.example.com` (a Statuspage) or `aws:<service>@<region>` (AWS Health).
     */
    STATUS_PROVIDERS: z.string().min(1).optional(),
    /** Directory of the built web app (apps/web/dist). When set, apps/api serves its pages and assets. */
    WEB_DIST_DIR: z.string().min(1).optional(),
    /** Dev only: the API that apps/web's vite dev server proxies /api, /v1, /mcp and /.well-known to. */
    API_URL: z.url().optional(),
    /** e2e only: the model credential the e2e tester (`pnpm e2e`) uses for its agent steps. */
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    /**
     * Dev and e2e only: keep auth emails in memory instead of sending them, readable at
     * GET /api/dev/mail. Refused when NODE_ENV is production (checked below).
     */
    DEV_MAIL_SINK: z.stringbool().optional(),
    /** Stripe, test mode only: the key must be an sk_test_ key (checked below, with a clear message). */
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    /** The signing secret of the Stripe webhook endpoint (whsec_...). Needed with STRIPE_SECRET_KEY. */
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    /**
     * The plans billing offers, as JSON: `[{"name":"pro","priceId":"price_..."}]`. Price ids come from
     * your Stripe test dashboard; none are made up here. Unset, no plans are offered.
     */
    STRIPE_PLANS: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  // Only an explicit yes: "false" or "0" must not turn validation off.
  skipValidation: ["1", "true"].includes(String(process.env.SKIP_ENV_VALIDATION).toLowerCase()),
  emptyStringAsUndefined: true,
})

// A mail sink holds real addresses and tokens in memory, so it must never run in production.
if (env.DEV_MAIL_SINK && env.NODE_ENV === "production") {
  throw new Error(
    "DEV_MAIL_SINK is for development and e2e only. Unset it when NODE_ENV=production.",
  )
}

// Billing runs in Stripe test mode only: a live key is refused here, before anything is charged.
if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error(
    "STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_...). Live keys are refused by this app.",
  )
}
