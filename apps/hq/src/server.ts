import { serve } from "@hono/node-server"
import { createAuth } from "@lab/auth"
import { createDb } from "@lab/db"
import { setErrorReporter } from "@lab/errors"
import { createLogger } from "@lab/logger"

import { createHqApp } from "./app"
import { hqEnv } from "./env"

const logger = createLogger({ name: "hq" })
setErrorReporter((error, context) => {
  logger.error({ err: error, ...context }, error.message)
})

// The e2e runner passes the port it picked as the first argument.
const config = hqEnv(process.argv[2])
const db = createDb(config.databaseUrl)
const auth = createAuth({
  db,
  secret: config.secret,
  baseURL: config.baseURL,
  emailFrom: config.emailFrom,
  oauthResources: [config.baseURL, `${config.baseURL}/mcp`],
  // The founders sign in from the web app's origin or an agent client; hq has no web app yet.
  webOrigins: [],
  rateLimit: {},
})

if (config.founders.userIds.length + config.founders.emails.length === 0) {
  logger.warn(
    "no founders configured (HQ_FOUNDER_EMAILS, HQ_FOUNDER_USER_IDS): nobody can approve proposals",
  )
}

const app = createHqApp({
  db,
  auth,
  now: () => new Date(),
  founders: config.founders,
  baseURL: config.baseURL,
})
serve({ fetch: app.fetch, port: config.port }, (addr) =>
  logger.info({ port: addr.port }, "hq listening"),
)
