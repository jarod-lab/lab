// `pnpm hq:predeploy`: refuse to deploy hq with an environment that would reopen sign-up or drop its
// founders (deploy-mode.ts, `predeployProblems`), then check the agent's founder list against hq's
// table (`founders:principals --check`). Exit 0 fit to deploy, 1 not.
import { hqEnv } from "./env"
import { predeployProblems } from "./deploy-mode"

const config = hqEnv()
const problems = predeployProblems(config)
if (problems.length > 0) {
  process.stderr.write(`hq is not fit to deploy:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`)
  process.exit(1)
}
process.stdout.write(
  "hq's environment is fit to deploy (production, sign-up off, founders by id).\n",
)
process.exit(0)
