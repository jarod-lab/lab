import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/** One origin in a list: http(s), a host, optional port, and no path, query or credentials. */
function isBareHttpOrigin(value: string): boolean {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "/" || url.pathname === "") &&
      url.search === "" &&
      url.hash === "" &&
      !trimmed.endsWith("/")
    )
  } catch {
    return false
  }
}

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
     * `Name=https://status.example.com` (a Statuspage), `Name=statusio:<page id>` (status.io), or
     * `aws`, `aws@<region>`, `aws:<service>@<region>` (AWS Health). Unset: the broad default below,
     * to narrow to what the app actually uses.
     */
    STATUS_PROVIDERS: z
      .string()
      .min(1)
      .default(
        "aws,Cloudflare=https://www.cloudflarestatus.com,Vercel=https://www.vercel-status.com," +
          "Neon=statusio:6878fc85709daa75be6c7e3c,PlanetScale=https://www.planetscalestatus.com",
      ),
    /** Directory of the built web app (apps/web/dist). When set, apps/api serves its pages and assets. */
    WEB_DIST_DIR: z.string().min(1).optional(),
    /**
     * Origins the web app runs on when it is not apps/api's own origin (`pnpm dev`, or a separate vite
     * server). Comma-separated bare origins, e.g. `https://web.starter.localhost` under pnpm dev. Trusted for auth callbacks and
     * passkeys, nothing else. Leave empty in production, where apps/api serves the web app itself.
     */
    WEB_ORIGINS: z
      .string()
      .min(1)
      .optional()
      .refine((value) => value === undefined || value.split(",").every(isBareHttpOrigin), {
        message: "WEB_ORIGINS must be comma-separated http(s) origins, e.g. http://127.0.0.1:5173",
      })
      .transform((value) =>
        value === undefined ? [] : value.split(",").map((origin) => new URL(origin.trim()).origin),
      ),
    /** Dev only: the API that apps/web's vite dev server proxies /api, /v1, /mcp and /.well-known to. */
    API_URL: z.url().optional(),
    /** e2e only: the model credential the e2e tester (`pnpm e2e`) uses for its agent steps. */
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    /**
     * Dev and e2e only: keep auth emails in memory instead of sending them, readable at
     * GET /api/dev/mail. Only with NODE_ENV development or test (checked below).
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

// A mail sink holds real addresses and tokens in memory, so it runs only where NODE_ENV says it is
// development or test. Anything else (production, or unset) is refused: failing open would leak mail.
if (env.DEV_MAIL_SINK && env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
  throw new Error(
    "DEV_MAIL_SINK is for development and e2e only. Set NODE_ENV to development or test, or unset DEV_MAIL_SINK.",
  )
}

// Billing runs in Stripe test mode only: a live key is refused here, before anything is charged.
if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  throw new Error(
    "STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_...). Live keys are refused by this app.",
  )
}
