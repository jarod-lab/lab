import { serve } from "@hono/node-server"
import { createAuth, parseStripePlans } from "@starter/auth"
import { createDb } from "@starter/db"
import { env } from "@starter/env"
import { reportError } from "@starter/errors"
import { createLogger } from "@starter/logger"
import { parseStatusProviders } from "@starter/observability"
import { createFileStore, type FileStore } from "@starter/storage"

import { analyticsFromEnv, captureAuthEvent, captureSignUp } from "./analytics"
import { createApp } from "./app"
import { createDevMailSink } from "./dev-mail"
import { recordAuthEvent } from "./data/audit"
import { createFlagService } from "./flags"
import { createApiHooks } from "./hooks"
import { createMeter } from "./meter"
import { createApiNotifier } from "./notifications"
import { createOperations } from "./operations"

const logger = createLogger({ name: "api" })
// Under `pnpm dev`, portless serves the app at PORTLESS_URL; OAuth issuer and docs links must match it.
const baseURL = (env.PORTLESS_URL ?? env.BETTER_AUTH_URL).replace(/\/$/, "")

const db = createDb(env.DATABASE_URL)
// Product analytics (docs/analytics.md): operation calls, auth events and the web app's page views.
const analytics = analyticsFromEnv(env, logger)
// Dev and e2e only (env refuses it in production): auth emails are kept in memory for GET /api/dev/mail.
const devMail = env.DEV_MAIL_SINK ? createDevMailSink() : undefined
if (devMail) logger.warn("DEV_MAIL_SINK is on: auth emails are not sent, they are kept in memory")
const auth = createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  baseURL,
  emailFrom: env.EMAIL_FROM,
  wrapsApiKey: env.WRAPS_API_KEY,
  // The web app's origins when it is not this one (pnpm dev, e2e). Empty when apps/api serves it.
  webOrigins: env.WEB_ORIGINS,
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
  // Rate limits on sign-in, mail and one-time codes, by client IP (rate-limit.ts). e2e turns them off.
  rateLimit: env.AUTH_RATE_LIMIT === "on" ? {} : false,
  // Auth activity (sign-in, failed sign-in, sign-out, ...) lands in the audit trail (auth-events.ts).
  onAuthEvent: async (event) => {
    captureAuthEvent(analytics, event)
    await recordAuthEvent(db, event)
  },
  // A notification that could not be recorded never fails the request; it is reported here.
  onNotificationError: (error, type) => reportError(error, { notification: type }),
  onSignUp: (event) => captureSignUp(analytics, event),
})

// Where uploads go (docs/storage.md). @starter/env has checked the chosen driver's variables are set.
function fileStore(): FileStore | undefined {
  switch (env.STORAGE_DRIVER) {
    case undefined:
      return undefined
    case "local":
      if (env.NODE_ENV === "production") {
        logger.warn("STORAGE_DRIVER=local in production: uploads live on this server's disk only")
      }
      return createFileStore({
        driver: "local",
        dir: env.STORAGE_LOCAL_DIR,
        publicUrl: env.STORAGE_PUBLIC_URL ?? `${baseURL}/files`,
      })
    case "s3":
      return createFileStore({
        driver: "s3",
        bucket: env.STORAGE_BUCKET ?? "",
        region: env.S3_REGION ?? "",
        accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
        sessionToken: env.S3_SESSION_TOKEN,
        endpoint: env.S3_ENDPOINT,
        publicUrl: env.STORAGE_PUBLIC_URL,
      })
    case "r2":
      return createFileStore({
        driver: "r2",
        accountId: env.R2_ACCOUNT_ID ?? "",
        bucket: env.STORAGE_BUCKET ?? "",
        accessKeyId: env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "",
        publicUrl: env.STORAGE_PUBLIC_URL ?? "",
      })
    case "vercel-blob":
      return createFileStore({ driver: "vercel-blob", token: env.BLOB_READ_WRITE_TOKEN ?? "" })
  }
}
const files = fileStore()

const meter = createMeter({
  db,
  limits: {
    claimed: env.ORG_DAILY_REQUEST_LIMIT,
    unclaimed: env.UNCLAIMED_ORG_DAILY_REQUEST_LIMIT,
  },
})

// One notifier for operations and the invoke hooks (usage.limit_reached).
const notifier = createApiNotifier({ auth, db })

// Feature flags (docs/feature-flags.md): one evaluator for OFREP and the operations, and the
// organization that manages the rollouts. Unset, nobody can change a rollout.
const flags = createFlagService({ db })
const operator = { organizationId: env.OPERATOR_ORGANIZATION_ID }
if (!operator.organizationId)
  logger.info("OPERATOR_ORGANIZATION_ID is unset: flag rollouts are read-only")

const app = createApp({
  devMail,
  auth,
  operations: createOperations({ auth, db, meter, notifier, files, operator, flags }),
  baseURL,
  name: "Starter API",
  version: "0.0.0",
  description: "The Starter API. Replace this with one sentence about what your product does.",
  logger,
  hooks: createApiHooks({
    db,
    meter,
    secret: env.BETTER_AUTH_SECRET,
    notifier,
    operator,
    analytics,
  }),
  flags,
  analytics,
  trustProxy: env.TRUST_PROXY,
  webDistDir: env.WEB_DIST_DIR,
  files,
  // Social sign-in fills user.image with the provider's avatar URL; pages show it.
  imageOrigins: [
    ...(env.GITHUB_CLIENT_ID ? ["https://avatars.githubusercontent.com"] : []),
    ...(env.GOOGLE_CLIENT_ID ? ["https://lh3.googleusercontent.com"] : []),
  ],
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

// Before the process goes (a deploy's SIGTERM, or Ctrl-C): write the flag exposures counted since
// the last flush, and send the analytics still queued.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void Promise.allSettled([flags.close(), analytics.shutdown()]).finally(() => process.exit(0))
  })
}
