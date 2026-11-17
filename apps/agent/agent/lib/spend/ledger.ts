import { decide } from "eve/ai"
import { hqFromEnv } from "../hq/env.js"
import { log } from "../log.js"
import { chatModelId, MODELS } from "../models.js"
import { turnEstimateUsd } from "./cap.js"
import { createSpendHooks } from "./hooks.js"
import { sessionSpendStore } from "./state.js"

/**
 * The one ledger the agent's hooks and tools share: eve's hooks (`agent/hooks/spend.ts`) and the
 * metered decision model (below) act on the same session state and the same hq key.
 */
export const spendLedger = createSpendHooks({
  hq: hqFromEnv,
  store: sessionSpendStore,
  estimateUsd: turnEstimateUsd,
  modelId: chatModelId,
})

/**
 * `decide()` with its cost recorded. eve emits no `usage.recorded` for a decision-model call (it
 * works outside any session), so every decision call the agent makes goes through here: inside a
 * chat turn it joins the turn's sum, inside a build it is recorded as build spend. `build: true` is
 * for calls made before a build's first turn (pretriage), where there is no turn to join.
 *
 * Metering failing never fails the call: it is logged, and the call's answer is returned.
 */
export const meteredDecide = (options: { build?: boolean } = {}): typeof decide =>
  (async (...args: Parameters<typeof decide>) => {
    const result = await decide(...args)
    try {
      const usage = (result as { usage?: { costUsd?: unknown } }).usage
      await spendLedger.decisionSpent({
        costUsd: typeof usage?.costUsd === "number" ? usage.costUsd : undefined,
        model: MODELS.decision,
        build: options.build,
      })
    } catch (error) {
      log.warn("spend: could not meter a decision call", error)
    }
    return result
  }) as typeof decide
