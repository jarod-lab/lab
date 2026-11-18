import { serve } from "@hono/node-server"
import { createDb } from "@lab/db"
import { setErrorReporter } from "@lab/errors"
import { createLogger } from "@lab/logger"

import { createHqApp } from "./app"
import { createHqAuth } from "./auth"
import { syncFounders } from "./data/founders"
import { hqEnv } from "./env"

const logger = createLogger({ name: "hq" })
setErrorReporter((error, context) => {
  logger.error({ err: error, ...context }, error.message)
})

// The e2e runner passes the port it picked as the first argument.
const config = hqEnv(process.argv[2])
const db = createDb(config.databaseUrl)
// Closed unless HQ_ALLOW_SIGNUP: a stranger cannot self-register on hq.
const auth = createHqAuth(db, config)

// The founders table is set to HQ_FOUNDERS at every boot: the listed are added, the rest removed.
const synced = await syncFounders(db, config.founders, new Date())
logger.info(
  { founders: config.founders.length, added: synced.added.length, removed: synced.removed.length },
  "founders synced",
)
for (const skipped of synced.skipped) logger.warn(`founder not synced, ${skipped}`)
if (config.founders.length === 0) {
  logger.warn("HQ_FOUNDERS is empty: nobody can approve proposals, in the admin or in Slack")
}
if (config.allowSignUp) logger.warn("HQ_ALLOW_SIGNUP is on: anyone can create an account on hq")
if (!config.slack.signingSecret || !config.slack.teamId) {
  logger.warn("SLACK_SIGNING_SECRET or HQ_SLACK_TEAM_ID is unset: Slack approvals are refused")
}

const app = createHqApp({
  db,
  auth,
  now: () => new Date(),
  slack: config.slack,
  baseURL: config.baseURL,
})
serve({ fetch: app.fetch, port: config.port }, (addr) =>
  logger.info({ port: addr.port }, "hq listening"),
)
