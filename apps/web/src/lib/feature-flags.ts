// Pure helpers for the Feature flags page. No network, no React.
import { z } from "zod"

import type { FeatureFlag, FlagStatus } from "./feature-flags-api"

export const FLAG_STATUS_LABEL: Record<FlagStatus, string> = {
  off: "Off",
  targeting: "Targets only",
  ramping: "Ramping",
  on: "On for all",
  paused: "Paused",
  reclaimed: "Reclaimed",
  orphaned: "Not in code",
}

export type StaleSignal = FeatureFlag["stale"][number]

export const STALE_LABEL: Record<StaleSignal, string> = {
  expired: "Past reclaim date",
  inactive: "Inactive 30 days",
  "single-value": "One value 7 days",
  "reclaimed-in-code": "Remove from code",
  orphaned: "Delete rollout",
}

/** The ramp steps the page offers as one-click buttons. */
export const RAMP_STEPS = [0, 1, 5, 25, 50, 100] as const

/** Whether the rollout can still change: not reclaimed, and the code still declares the flag. */
export const canChangeRollout = (flag: Pick<FeatureFlag, "status" | "inCatalog">): boolean =>
  flag.inCatalog && flag.status !== "reclaimed"

/** "2 on · 1 off", or "None" with no targets. */
export function targetsSummary(flag: Pick<FeatureFlag, "targetsOn" | "targetsOff">): string {
  const parts = [
    flag.targetsOn > 0 ? `${flag.targetsOn} on` : null,
    flag.targetsOff > 0 ? `${flag.targetsOff} off` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "None"
}

/**
 * Errors per 1,000 evaluations of one value, to one decimal ("0.4"), or "–" with no evaluations.
 * The evidence to compare between on and off before ramping further or reclaiming.
 */
export function errorRate(evaluations: number, errors: number): string {
  if (evaluations <= 0) return "–"
  return ((errors / evaluations) * 1000).toFixed(1)
}

/** The percentage form: a whole number from 0 to 100, typed as text. */
export const percentageSchema = z.object({
  percentage: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, "Enter a whole number from 0 to 100.")
    .refine((value) => Number(value) <= 100, "Enter a whole number from 0 to 100."),
})

/** The add-targets form: organization ids or slugs, separated by commas, spaces or new lines. */
export const targetsSchema = z.object({
  organizations: z
    .string()
    .refine((value) => parseOrganizations(value).length > 0, "Enter at least one id or slug.")
    .refine((value) => parseOrganizations(value).length <= 100, "Add at most 100 at a time."),
  value: z.enum(["on", "off"]),
})

/** The organizations a person typed: split, trimmed, without blanks or repeats. */
export function parseOrganizations(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter((part) => part.length > 0))]
}
