// Feature flags are declared in code, so a flag that is removed turns every call site that still
// reads it into a compile error. Their rollout (who sees them) is runtime state in the database.
// Browser-safe: the web app imports this package, so it may import nothing server-side.

/** One release flag. Boolean only: multi-variant experiments are on the roadmap. */
export interface FlagDefinition {
  /** What turning it on changes, for the person or agent ramping it. */
  description: string
  /** Who decides the rollout and removes the flag: a team or a person's handle. */
  owner: string
  /** The value when the flag has no rollout, is paused, or can't be evaluated. */
  default: boolean
  /**
   * The day (`YYYY-MM-DD`, UTC) the flag should be reclaimed by. After it, the flag is reported
   * stale (`expired`). Release flags are temporary; leave it out only for a permanent kill switch.
   */
  reclaimBy?: string
}

export type FlagCatalog = Readonly<Record<string, FlagDefinition>>

/** Kebab-case, as OpenFeature keys usually are: `new-run-timeline`. */
const KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** Declare the product's flags. Checks keys and dates once, at import. */
export function defineFlags<const C extends FlagCatalog>(catalog: C): C {
  for (const [key, flag] of Object.entries(catalog)) {
    if (!KEY.test(key) || key.length > 64) {
      throw new Error(`Flag key must be kebab-case, at most 64 characters: ${key}`)
    }
    if (flag.reclaimBy !== undefined && !isDay(flag.reclaimBy)) {
      throw new Error(`${key}: reclaimBy must be a YYYY-MM-DD date, got ${flag.reclaimBy}`)
    }
  }
  return catalog
}

const isDay = (value: string) =>
  DAY.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)

/** Whether a flag key is well formed, for keys that arrive from outside (OFREP, the API). */
export const isFlagKey = (key: string): boolean => KEY.test(key) && key.length <= 64
