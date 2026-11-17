import { defineHook } from "eve/hooks"
import { hqFromEnv } from "../lib/hq/env.js"
import { chatModelId } from "../lib/models.js"
import { turnEstimateUsd } from "../lib/spend/cap.js"
import { createSpendHooks } from "../lib/spend/hooks.js"
import { sessionSpendStore } from "../lib/spend/state.js"

/**
 * The daily spend cap and the ledger, as eve hooks. A refused turn is cancelled here and tells the
 * Slack renderer why through session state (`SpendState.refusal`), because the cancelled turn's
 * `turn.settled` carries no cause.
 *
 * - `turn.started` reserves the turn's estimate in hq before the first model call, and cancels the
 *   turn when hq refuses or cannot be asked.
 * - `usage.recorded` sums what each model run and delegated call cost.
 * - `turn.settled` settles the hold once, at the summed cost or at the estimate.
 *
 * The logic is in `agent/lib/spend/hooks.ts`, where it is tested without an eve runtime.
 */
const spend = createSpendHooks({
  hq: hqFromEnv,
  store: sessionSpendStore,
  estimateUsd: turnEstimateUsd,
  modelId: chatModelId,
})

export default defineHook({
  events: {
    "turn.started": (event, ctx) => spend.turnStarted(event, ctx),
    "usage.recorded": (event, ctx) => spend.usageRecorded(event, ctx),
    "turn.settled": (event, ctx) => spend.turnSettled(event, ctx),
  },
})
