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
 * Wraps `decide()` so its cost is recorded, once. Inside a session eve's `decide()` also emits a
 * `usage.recorded` of kind "decision" (owner null) carrying the gateway's cost; outside one (a
 * build's pretriage) it emits nothing. The usage hook skips the former so this wrapper, which every
 * decision call goes through, is the single source: inside a chat turn the call joins the turn's
 * sum, inside a build it is recorded as build spend. `build: true` is for calls made before a
 * build's first turn (pretriage), where there is no turn.
 *
 * - `decide()`'s result carries tokens and no cost, so the call is charged at the larger of the
 *   decision estimate and its token floor (`prices.ts`), which over-counts the gateway's own figure.
 *   A result that does carry `usage.costUsd` > 0 is charged at that cost.
 * - A call that throws is not metered and its error is not swallowed: no answer, nothing to price.
 * - Metering failing never fails the call: it is logged, and the call's answer is returned.
 */
export function createMeteredDecide(deps: MeteringDeps) {
  return (options: { build?: boolean } = {}): typeof decide =>
    (async (...args: Parameters<typeof decide>) => {
      const result = await deps.decide(...args)
      try {
        const usage = (result as { usage?: Record<string, unknown> }).usage
        const count = (value: unknown) => (typeof value === "number" ? value : undefined)
        await deps.ledger.decisionSpent({
          costUsd: count(usage?.costUsd),
          ...(count(usage?.inputTokens) !== undefined && {
            inputTokens: count(usage?.inputTokens),
          }),
          ...(count(usage?.outputTokens) !== undefined && {
            outputTokens: count(usage?.outputTokens),
          }),
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
