import { serve } from "@hono/node-server"
import { createAuth } from "@starter/auth"
import { createDb } from "@starter/db"
import { env } from "@starter/env"
import { createLogger } from "@starter/logger"
import { parseStatusProviders } from "@starter/observability"

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
  hooks: createApiHooks({ db, meter, secret: env.BETTER_AUTH_SECRET }),
  trustProxy: env.TRUST_PROXY,
  webDistDir: env.WEB_DIST_DIR,
  // Parsed here so a malformed list stops startup instead of showing nothing.
  ...(env.STATUS_PROVIDERS && {
    status: { providers: parseStatusProviders(env.STATUS_PROVIDERS) },
  }),
  // The MCP registry entry (/.well-known/mcp/server.json). Rename before publishing: the name is
  // reverse-DNS for a namespace you can prove (io.github.<owner>/<repo> or your domain).
  registry: {
    name: "io.github.example/starter",
    description: "Starter API: projects, API keys, agent access and audit for people and agents.",
  },
})

const port = env.PORT ?? (Number(new URL(baseURL).port) || 3000)
serve({ fetch: app.fetch, port }, (addr) => logger.info({ port: addr.port }, "api listening"))
