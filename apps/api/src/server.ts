import { serve } from "@hono/node-server"
import { createAuth, parseStripePlans } from "@starter/auth"
import { createDb } from "@starter/db"
import { env } from "@starter/env"
import { createLogger } from "@starter/logger"
import { parseStatusProviders } from "@starter/observability"

import { createApp } from "./app"
import { createDevMailSink } from "./dev-mail"
import { createApiHooks } from "./hooks"
import { createMeter } from "./meter"
import { createOperations } from "./operations"

const logger = createLogger({ name: "api" })
// Under `pnpm dev`, portless serves the app at PORTLESS_URL; OAuth issuer and docs links must match it.
const baseURL = (env.PORTLESS_URL ?? env.BETTER_AUTH_URL).replace(/\/$/, "")

const db = createDb(env.DATABASE_URL)
// Dev and e2e only (env refuses it in production): auth emails are kept in memory for GET /api/dev/mail.
const devMail = env.DEV_MAIL_SINK ? createDevMailSink() : undefined
if (devMail) logger.warn("DEV_MAIL_SINK is on: auth emails are not sent, they are kept in memory")
const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  emailFrom: env.EMAIL_FROM,
  wrapsApiKey: env.WRAPS_API_KEY,
  ses: devMail ? { client: devMail.client } : undefined,
  // Stripe runs only in test mode, and only with both keys (createAuth refuses a live key).
  stripe:
    env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
      ? {
          secretKey: env.STRIPE_SECRET_KEY,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET,
          plans: parseStripePlans(env.STRIPE_PLANS),
        }
      : undefined,
  oauthResources: [baseURL, `${baseURL}/mcp`],
  github:
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
      : undefined,
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
      : undefined,
  passwordBreachCheck: true,
})

const meter = createMeter({
  db,
  limits: {
    claimed: env.ORG_DAILY_REQUEST_LIMIT,
    unclaimed: env.UNCLAIMED_ORG_DAILY_REQUEST_LIMIT,
  },
})

const app = createApp({
  devMail,
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
