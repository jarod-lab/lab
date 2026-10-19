// Evaluating a flag for one organization: the same rules wherever it runs (the API's OpenFeature
// provider, the OFREP endpoint). Order, first match wins, as in flagd and Spotify's Confidence:
//   1. reclaimed: the decided value, for everyone (STATIC)
//   2. no rollout, or paused: the code default (DISABLED)
//   3. the organization is a target: the target's value (TARGETING_MATCH)
//   4. the organization's bucket is under the percentage: on, else off (SPLIT; STATIC at 0 or 100)
import type { FlagDefinition } from "./define"

/** A flag's runtime state, as the evaluator needs it. */
export interface Rollout {
  enabled: boolean
  /** Whole percent, 0 to 100, of the organizations that are not targets. */
  percentage: number
  /** Set once reclaimed: the value every organization gets from then on. */
  reclaimedValue: boolean | null
}

/** OpenFeature resolution reasons, as OFREP sends them. */
export type FlagReason = "STATIC" | "TARGETING_MATCH" | "SPLIT" | "DISABLED"

export interface Evaluation {
  key: string
  value: boolean
  /** `on` or `off`, the variant names OpenFeature reports. */
  variant: "on" | "off"
  reason: FlagReason
}

export interface EvaluateInput {
  key: string
  flag: FlagDefinition
  /** Null when the flag has no rollout yet. */
  rollout: Rollout | null
  /** The organization's target value, if it is a target of this flag. */
  target?: boolean
  organizationId: string
}

export function evaluate({
  key,
  flag,
  rollout,
  target,
  organizationId,
}: EvaluateInput): Evaluation {
  const result = (value: boolean, reason: FlagReason): Evaluation => ({
    key,
    value,
    variant: value ? "on" : "off",
    reason,
  })
  if (rollout?.reclaimedValue != null) return result(rollout.reclaimedValue, "STATIC")
  if (!rollout?.enabled) return result(flag.default, "DISABLED")
  if (target !== undefined) return result(target, "TARGETING_MATCH")
  if (rollout.percentage <= 0) return result(false, "STATIC")
  if (rollout.percentage >= 100) return result(true, "STATIC")
  return result(bucket(key, organizationId) < rollout.percentage * 100, "SPLIT")
}

/** Buckets per flag: 10 000, so a percentage resolves to a hundredth of a percent. */
export const BUCKETS = 10_000

/**
 * An organization's fixed place for a flag, 0 to 9999: murmur3 (32-bit, seed 0, as flagd's
 * fractional targeting uses) of `<key>/<organizationId>`. The key is in the hash so each flag's
 * early organizations differ; the organization keeps its bucket as the percentage moves.
 */
export function bucket(key: string, organizationId: string): number {
  return Math.floor((murmur3(`${key}/${organizationId}`) / 0x1_0000_0000) * BUCKETS)
}

/** MurmurHash3 x86 32-bit of the UTF-8 bytes, unsigned. */
export function murmur3(text: string, seed = 0): number {
  const bytes = new TextEncoder().encode(text)
  const c1 = 0xcc9e2d51
  const c2 = 0x1b873593
  let h = seed >>> 0
  const blocks = bytes.length - (bytes.length % 4)
  for (let i = 0; i < blocks; i += 4) {
    let k =
      (bytes[i] ?? 0) |
      ((bytes[i + 1] ?? 0) << 8) |
      ((bytes[i + 2] ?? 0) << 16) |
      ((bytes[i + 3] ?? 0) << 24)
    k = Math.imul(k, c1)
    k = (k << 15) | (k >>> 17)
    k = Math.imul(k, c2)
    h ^= k
    h = (h << 13) | (h >>> 19)
    h = (Math.imul(h, 5) + 0xe6546b64) | 0
  }
  let k = 0
  const tail = bytes.length % 4
  if (tail === 3) k ^= (bytes[blocks + 2] ?? 0) << 16
  if (tail >= 2) k ^= (bytes[blocks + 1] ?? 0) << 8
  if (tail >= 1) {
    k ^= bytes[blocks] ?? 0
    k = Math.imul(k, c1)
    k = (k << 15) | (k >>> 17)
    k = Math.imul(k, c2)
    h ^= k
  }
  h ^= bytes.length
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
