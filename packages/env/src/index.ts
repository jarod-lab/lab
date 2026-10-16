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
  },
  runtimeEnv: process.env,
  // Only an explicit yes: "false" or "0" must not turn validation off.
  skipValidation: ["1", "true"].includes(String(process.env.SKIP_ENV_VALIDATION).toLowerCase()),
  emptyStringAsUndefined: true,
})
