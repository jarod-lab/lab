export const MERGE_MINUTES_AGO: {
  deploying: number
  verifyingLate: number
  verifyingReopened: number
  done: number
}
export const SEED_ISSUES: {
  triage: number
  asking: number
  planned: number
  building: number
  exhausted: number
  pendingMerge: number
  deploying: number
  verifyingLate: number
  reopened: number
  done: number
}
export type SeedRole = keyof typeof SEED_ISSUES

export function cookieHeaderFrom(text: string): string

export interface SeedResult {
  built: SeedRole[]
  found: SeedRole[]
  /** The display id of each item, by role. */
  ids: Partial<Record<SeedRole, string>>
  sweep: {
    advanced: string[]
    passed: string[]
    reopened: string[]
    retriaged: string[]
    abandoned: string[]
    errors: unknown[]
  } | null
  warnings: string[]
  /** Every `METHOD /path` the script sent. */
  touched: string[]
  now: string
}

export function seedWork(input: {
  baseUrl: string
  /** The Cookie header value of a founder's session. */
  cookie: string
  fetch?: typeof fetch
  repo?: string
}): Promise<SeedResult>
