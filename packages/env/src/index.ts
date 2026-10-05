import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Single source of truth for environment variables. Keep `.env.example` in sync.
 * Validation runs on first import; set SKIP_ENV_VALIDATION=1 for builds/tests that don't need it.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    EMAIL_FROM: z.string().min(1),
    WRAPS_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
