import { describe, expect, it } from "vitest"

import { defineFlags, isFlagKey } from "./define"
import { BUCKETS, bucket, evaluate, murmur3, type Rollout } from "./evaluate"

const flag = { description: "d", owner: "o", default: false }
const on = (percentage: number): Rollout => ({ enabled: true, percentage, reclaimedValue: null })
const orgs = Array.from({ length: 4000 }, (_, i) => `org-${i}`)

describe("murmur3", () => {
  it("matches the reference vectors", () => {
    expect(murmur3("")).toBe(0)
    expect(murmur3("hello")).toBe(0x248bfa47)
    expect(murmur3("The quick brown fox jumps over the lazy dog")).toBe(0x2e4ff723)
    expect(murmur3("", 1)).toBe(0x514e28b7)
  })
})

describe("bucket", () => {
  it("is fixed per flag and organization, and in range", () => {
    expect(bucket("a", "org-1")).toBe(bucket("a", "org-1"))
    for (const org of orgs.slice(0, 200)) {
      const b = bucket("a", org)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThan(BUCKETS)
    }
  })

  it("spreads organizations evenly, and differently per flag", () => {
    const share = (key: string, pct: number) =>
      orgs.filter((o) => evaluate({ key, flag, rollout: on(pct), organizationId: o }).value)
        .length / orgs.length
    expect(share("a", 25)).toBeGreaterThan(0.22)
    expect(share("a", 25)).toBeLessThan(0.28)
    const firstA = orgs.filter((o) => bucket("a", o) < 1000)
    const firstB = orgs.filter((o) => bucket("b", o) < 1000)
    expect(firstA).not.toEqual(firstB)
  })

  it("only adds organizations as the percentage rises", () => {
    const at = (pct: number) =>
      new Set(
        orgs.filter(
          (o) => evaluate({ key: "ramp", flag, rollout: on(pct), organizationId: o }).value,
        ),
      )
    let previous = at(1)
    for (const pct of [5, 10, 25, 50, 75, 99]) {
      const next = at(pct)
      for (const org of previous) expect(next.has(org)).toBe(true)
      previous = next
    }
  })
})

describe("evaluate", () => {
  const base = { key: "f", flag, organizationId: "org-1" }

  it("serves the default with no rollout or when paused", () => {
    expect(evaluate({ ...base, rollout: null })).toEqual({
      key: "f",
      value: false,
      variant: "off",
      reason: "DISABLED",
    })
    const paused = { ...on(100), enabled: false }
    expect(
      evaluate({ ...base, flag: { ...flag, default: true }, rollout: paused, target: false }),
    ).toMatchObject({ value: true, reason: "DISABLED" })
  })

  it("serves the reclaimed value to everyone, paused or targeted", () => {
    const reclaimed = { enabled: false, percentage: 0, reclaimedValue: true }
    expect(evaluate({ ...base, rollout: reclaimed, target: false })).toMatchObject({
      value: true,
      variant: "on",
      reason: "STATIC",
    })
  })

  it("lets a target override the percentage both ways", () => {
    expect(evaluate({ ...base, rollout: on(0), target: true })).toMatchObject({
      value: true,
      reason: "TARGETING_MATCH",
    })
    expect(evaluate({ ...base, rollout: on(100), target: false })).toMatchObject({
      value: false,
      reason: "TARGETING_MATCH",
    })
  })

  it("is STATIC at 0 and 100, SPLIT between", () => {
    expect(evaluate({ ...base, rollout: on(0) })).toMatchObject({ value: false, reason: "STATIC" })
    expect(evaluate({ ...base, rollout: on(100) })).toMatchObject({ value: true, reason: "STATIC" })
    expect(evaluate({ ...base, rollout: on(50) }).reason).toBe("SPLIT")
  })
})

describe("defineFlags", () => {
  it("accepts kebab-case keys and real days", () => {
    expect(defineFlags({ "new-run-timeline": { ...flag, reclaimBy: "2027-02-28" } })).toBeTruthy()
    expect(isFlagKey("a-b2")).toBe(true)
    expect(isFlagKey("A_b")).toBe(false)
    expect(isFlagKey("a".repeat(65))).toBe(false)
  })

  it("refuses bad keys and dates", () => {
    expect(() => defineFlags({ New_Flag: flag })).toThrow(/kebab-case/)
    expect(() => defineFlags({ ["a".repeat(65)]: flag })).toThrow(/kebab-case/)
    expect(() => defineFlags({ f: { ...flag, reclaimBy: "2027-02-30" } })).toThrow(/YYYY-MM-DD/)
    expect(() => defineFlags({ f: { ...flag, reclaimBy: "soon" } })).toThrow(/YYYY-MM-DD/)
  })
})
