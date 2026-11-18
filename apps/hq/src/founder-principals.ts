// `pnpm --filter @lab/hq founders:principals [--check]`: the agent's founder list, from hq's table.
//
// Without a flag it prints the AGENT_FOUNDER_PRINCIPALS line to store in the org's vault, derived
// from the `founders` table and HQ_SLACK_TEAM_ID. With --check it compares that with the
// AGENT_FOUNDER_PRINCIPALS in this environment and exits 1 on any difference, so a deploy or a CI
// job can refuse to ship while hq and the agent disagree about who the founders are.
import { createDb } from "@lab/db"
import { env } from "@lab/env"
import { agentEnv } from "@lab/env/agent"

import { checkFounderPrincipals, founderPrincipalsFromDb } from "./slack/principals"

const databaseUrl = env.HQ_DATABASE_URL
const teamId = env.HQ_SLACK_TEAM_ID
if (!databaseUrl || !teamId) {
  process.stderr.write("HQ_DATABASE_URL and HQ_SLACK_TEAM_ID must be set.\n")
  process.exit(2)
}

const derived = await founderPrincipalsFromDb(createDb(databaseUrl), teamId)
if (process.argv.includes("--check")) {
  const drift = checkFounderPrincipals(derived, agentEnv("AGENT_FOUNDER_PRINCIPALS"))
  if (drift.ok) {
    process.stdout.write(`AGENT_FOUNDER_PRINCIPALS matches hq's founders (${derived.length}).\n`)
  } else {
    process.stderr.write(
      `AGENT_FOUNDER_PRINCIPALS disagrees with hq's founders table.\n` +
        `  missing from the agent: ${drift.missing.join(", ") || "none"}\n` +
        `  listed by the agent but not founders in hq: ${drift.extra.join(", ") || "none"}\n`,
    )
    process.exitCode = 1
  }
} else {
  process.stdout.write(`AGENT_FOUNDER_PRINCIPALS=${derived.join(",")}\n`)
}
process.exit(process.exitCode ?? 0)
