// `pnpm hq:predeploy`: refuse to deploy hq with an environment that would reopen sign-up or drop its
// founders (deploy-mode.ts, `predeployProblems`), then WRITE the founders table from HQ_FOUNDERS
// (boot.ts, `publishFounders`, under an advisory lock), then check the agent's founder list against
// hq's table (`founders:principals --check`). A deployed hq never writes the table at boot, it only
// checks it against its own list, so this is the one place a deploy sets who the founders are, and
// the deploy that runs it last wins: an older deployment still reachable finds a different table
// and refuses every request. Run it against the production environment before every deploy.
// Exit 0 fit to deploy, 1 not.
import { createDb } from "@lab/db"

import { publishFounders } from "./boot"
import { predeployProblems } from "./deploy-mode"
import { hqEnv } from "./env"

const config = hqEnv()
const problems = predeployProblems(config)
if (problems.length > 0) {
  process.stderr.write(`hq is not fit to deploy:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`)
  process.exit(1)
}
const db = createDb(config.databaseUrl)
const synced = await publishFounders(config, db, new Date())
process.stdout.write(
  `founders table set from HQ_FOUNDERS: ${synced.added.length} added, ${synced.removed.length} removed, ` +
    `${synced.skipped.length} skipped.\n`,
)
for (const skipped of synced.skipped) {
  process.stderr.write(
    `  not synced: HQ_FOUNDERS entry ${skipped.entry} (${skipped.kind}): ${skipped.why}\n`,
  )
}
await db.$client.end()
process.stdout.write(
  "hq's environment is fit to deploy (production, sign-up off, founders by id).\n",
)
process.exit(0)
