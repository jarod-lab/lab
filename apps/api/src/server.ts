import { serve } from "@hono/node-server"
import { createAuth } from "@starter/auth"
import { createDb } from "@starter/db"
import { env } from "@starter/env"
import { createLogger } from "@starter/logger"

import { createApp } from "./app"
import { createApiHooks } from "./hooks"
import { createMeter } from "./meter"
import { createOperations } from "./operations"

const logger = createLogger({ name: "api" })
// Under `pnpm dev`, portless serves the app at PORTLESS_URL; OAuth issuer and docs links must match it.
const baseURL = (env.PORTLESS_URL ?? env.BETTER_AUTH_URL).replace(/\/$/, "")

const db = createDb(env.DATABASE_URL)
const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  emailFrom: env.EMAIL_FROM,
  wrapsApiKey: env.WRAPS_API_KEY,
  oauthResources: [baseURL, `${baseURL}/mcp`],
})

const meter = createMeter({
  db,
  limits: {
    claimed: env.ORG_DAILY_REQUEST_LIMIT,
    unclaimed: env.UNCLAIMED_ORG_DAILY_REQUEST_LIMIT,
  },
})

const app = createApp({
  auth,
  operations: createOperations({ auth, db, meter }),
  baseURL,
  name: "Starter API",
  version: "0.0.0",
  description: "The Starter API. Replace this with one sentence about what your product does.",
  logger,
  hooks: createApiHooks({ db, meter }),
  trustProxy: env.TRUST_PROXY,
  webDistDir: env.WEB_DIST_DIR,
})

const port = env.PORT ?? (Number(new URL(baseURL).port) || 3000)
serve({ fetch: app.fetch, port }, (addr) => logger.info({ port: addr.port }, "api listening"))
