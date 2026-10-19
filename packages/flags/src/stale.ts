// Stale signals: why a flag should be removed, after the cleanup scans in Spotify's Confidence.
// Each one is evidence an agent can act on: remove the code, then delete the rollout.

export type StaleSignal =
  /** Past its `reclaimBy` day. */
  | "expired"
  /** Evaluated before, but not in the last 30 days: nothing reads it any more. */
  | "inactive"
  /** Served one value only for 7 days: it acts as a constant. */
  | "single-value"
  /** Reclaimed, but still in the catalog: its code is due for removal. */
  | "reclaimed-in-code"
  /** A rollout for a key the catalog no longer has: delete it. */
  | "orphaned"

export const INACTIVE_DAYS = 30
export const SINGLE_VALUE_DAYS = 7

/** Evaluations per UTC day (`YYYY-MM-DD`) and value. */
export interface ExposureDay {
  day: string
  value: boolean
  count: number
}

export interface StaleInput {
  inCatalog: boolean
  reclaimBy?: string
  reclaimed: boolean
  /** When the rollout last changed, or undefined when the flag has none. */
  rolloutUpdatedAt?: Date
  exposures: readonly ExposureDay[]
  now: Date
}

const DAY_MS = 86_400_000
/** The UTC day `days` before `now`, as `YYYY-MM-DD`. */
export const dayBefore = (now: Date, days: number) =>
  new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10)

export function staleSignals(input: StaleInput): StaleSignal[] {
  const { exposures, now } = input
  if (!input.inCatalog) return ["orphaned"]
  const signals: StaleSignal[] = []
  const today = now.toISOString().slice(0, 10)
  if (input.reclaimBy !== undefined && input.reclaimBy < today) signals.push("expired")

  const recent = exposures.filter((e) => e.day > dayBefore(now, INACTIVE_DAYS) && e.count > 0)
  // A new flag that nothing has read yet is not inactive: it needs history first.
  const old =
    exposures.some((e) => e.count > 0) ||
    (input.rolloutUpdatedAt !== undefined &&
      input.rolloutUpdatedAt.getTime() < now.getTime() - INACTIVE_DAYS * DAY_MS)
  if (recent.length === 0 && old) signals.push("inactive")

  const week = recent.filter((e) => e.day > dayBefore(now, SINGLE_VALUE_DAYS))
  if (week.length > 0 && new Set(week.map((e) => e.value)).size === 1) signals.push("single-value")

  if (input.reclaimed) signals.push("reclaimed-in-code")
  return signals
}
