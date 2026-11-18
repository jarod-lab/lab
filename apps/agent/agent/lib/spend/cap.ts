import { agentEnv } from "@lab/env/agent"
import type { HqClient } from "../hq/client.js"

/**
 * The daily Eve spend cap ($10.00 a day per org, set in hq): the check a turn passes before any
 * model call.
 *
 * @remarks
 * hq owns the arithmetic. `reserve_spend` holds the turn's estimate in one transaction, so two
 * turns racing at $9.90 cannot both start (proved in hq's own tests). This module only asks and
 * fails closed: a refusal, an hq outage and a malformed answer all mean the turn does not run.
 * Nothing here weakens or reads the cap's size.
 */

/** What a turn is assumed to cost until its real cost is known, when nothing says otherwise. */
export const DEFAULT_TURN_ESTIMATE_USD = 0.1

/** What one unattended build model run is recorded at when the provider reports no cost. */
export const BUILD_ESTIMATE_USD = 0.25

/** What one decision-model call (`decide()`, which reports no cost to the ledger) is priced at. */
export const DECISION_ESTIMATE_USD = 0.02

/** The most an estimate may be set to: a typo must not hold the day's whole cap. */
const MAX_ESTIMATE_USD = 5

/** The per-turn estimate: AGENT_TURN_ESTIMATE_USD when it is a sensible amount, else the default. */
export function turnEstimateUsd(): number {
  const raw = agentEnv("AGENT_TURN_ESTIMATE_USD")
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TURN_ESTIMATE_USD
  }
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_TURN_ESTIMATE_USD
  }
  // Too large an amount is clamped, not ignored: an operator who asked for more gets the most.
  return Math.min(value, MAX_ESTIMATE_USD)
}

export type CapResult =
  | { allowed: true; holdId: string }
  | {
      allowed: false
      /** What hq says is left today; 0 when hq could not be asked. */
      remainingUsd: number
      /** True when hq could not be reached or answered badly: the cap could not be checked. */
      unavailable?: true
    }

/**
 * Reserves `estimateUsd` against today's cap.
 *
 * @returns `allowed: true` with the hold to settle when the turn ends, or `allowed: false`. It never
 * throws: when hq cannot be asked the cap cannot be checked, which is a refusal, not a pass.
 */
export async function checkCap(
  hq: Pick<HqClient, "reserveSpend">,
  estimateUsd: number,
  options: { runId?: string } = {},
): Promise<CapResult> {
  let reservation: Awaited<ReturnType<HqClient["reserveSpend"]>>
  try {
    reservation = await hq.reserveSpend({ estimateUsd, runId: options.runId })
  } catch {
    return { allowed: false, remainingUsd: 0, unavailable: true }
  }
  if ("holdId" in reservation && reservation.holdId !== "") {
    return { allowed: true, holdId: reservation.holdId }
  }
  if ("refused" in reservation) {
    return { allowed: false, remainingUsd: Math.max(0, reservation.remainingUsd) }
  }
  return { allowed: false, remainingUsd: 0, unavailable: true }
}

const usd = (amount: number) => `$${amount.toFixed(2)}`

/**
 * What the thread is told when a turn is refused. A pure function of the refusal: the Slack renderer
 * posts it, and tests read it.
 */
export function refusalText(refusal: { remainingUsd: number; unavailable?: boolean }): string {
  if (refusal.unavailable) {
    return "I can't check today's spend cap right now, so I haven't run this. Please try again in a few minutes."
  }
  return `Today's spend cap is reached: ${usd(refusal.remainingUsd)} left, and this turn needs more. I haven't run it. A founder can raise today's allowance (hq's admin spend page, or ask in this thread); then ask me again.`
}
