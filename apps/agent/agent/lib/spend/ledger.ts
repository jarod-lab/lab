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

export interface MeteringDeps {
  /** The real `decide()`; a test passes a fake. */
  decide: typeof decide
  ledger: Pick<typeof spendLedger, "decisionSpent">
  /** The decision model's name, recorded with the cost. */
  model: string
}

/**
 * Wraps `decide()` so its cost is recorded. eve emits no `usage.recorded` for a decision-model call
 * (it works outside any session), so every decision call the agent makes goes through the wrapper:
 * inside a chat turn it joins the turn's sum, inside a build it is recorded as build spend.
 * `build: true` is for calls made before a build's first turn (pretriage), where there is no turn.
 *
 * - The cost is the call's `usage.costUsd` when it reports one, else the decision estimate.
 * - A call that throws is not metered and its error is not swallowed: no answer, nothing to price.
 * - Metering failing never fails the call: it is logged, and the call's answer is returned.
 */
export function createMeteredDecide(deps: MeteringDeps) {
  return (options: { build?: boolean } = {}): typeof decide =>
    (async (...args: Parameters<typeof decide>) => {
      const result = await deps.decide(...args)
      try {
        const usage = (result as { usage?: { costUsd?: unknown } }).usage
        await deps.ledger.decisionSpent({
          costUsd: typeof usage?.costUsd === "number" ? usage.costUsd : undefined,
          model: deps.model,
          build: options.build,
        })
      } catch (error) {
        log.warn("spend: could not meter a decision call", error)
      }
      return result
    }) as typeof decide
}

/**
 * What the production `meteredDecide` is built from: eve's real `decide()`, the agent's one ledger
 * and the decision model's name. Exported so a test can pin them by identity; `createMeteredDecide`
 * reads this object on every call, so the test can also replace a member and watch it being used.
 */
export const meteredDecideDeps: MeteringDeps = {
  decide,
  ledger: spendLedger,
  model: MODELS.decision,
}

/** `decide()` with its cost recorded, on the agent's real ledger. */
export const meteredDecide = createMeteredDecide(meteredDecideDeps)
