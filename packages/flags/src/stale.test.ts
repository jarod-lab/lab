import { describe, expect, it } from "vitest"

import { flags } from "./catalog"
import { dayBefore, type ExposureDay, staleSignals } from "./stale"

const now = new Date("2026-10-19T12:00:00Z")
const ago = (days: number, value = true, count = 3): ExposureDay => ({
  day: dayBefore(now, days),
  value,
  count,
})
const base = { inCatalog: true, reclaimed: false, exposures: [], now }

describe("staleSignals", () => {
  it("reports nothing for a new flag that nothing has read yet", () => {
    expect(staleSignals(base)).toEqual([])
  })

  it("reports a rollout for a key the catalog dropped as orphaned, only", () => {
    expect(staleSignals({ ...base, inCatalog: false, reclaimed: true })).toEqual(["orphaned"])
  })

  it("reports a flag past its reclaimBy day as expired", () => {
    expect(staleSignals({ ...base, reclaimBy: "2026-10-18" })).toEqual(["expired"])
    expect(staleSignals({ ...base, reclaimBy: "2026-10-19" })).toEqual([])
  })

  it("reports inactive after 30 days without an evaluation", () => {
    expect(staleSignals({ ...base, exposures: [ago(40)] })).toEqual(["inactive"])
    expect(staleSignals({ ...base, rolloutUpdatedAt: new Date("2026-08-01") })).toEqual([
      "inactive",
    ])
    expect(staleSignals({ ...base, rolloutUpdatedAt: new Date("2026-10-01") })).toEqual([])
  })

  it("reports single-value when the last week served one value", () => {
    expect(staleSignals({ ...base, exposures: [ago(1), ago(3)] })).toEqual(["single-value"])
    expect(staleSignals({ ...base, exposures: [ago(1), ago(3, false)] })).toEqual([])
    // Zero counts are not evaluations.
    expect(staleSignals({ ...base, exposures: [ago(1), ago(2, false, 0)] })).toEqual([
      "single-value",
    ])
  })

  it("reports a reclaimed flag still in the catalog", () => {
    expect(staleSignals({ ...base, reclaimed: true, exposures: [ago(1)] })).toEqual([
      "single-value",
      "reclaimed-in-code",
    ])
  })
})

describe("the catalog", () => {
  it("has the example flag, off by default", () => {
    expect(flags["whats-new-card"].default).toBe(false)
  })
})
