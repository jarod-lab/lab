import { upgradeTo } from "@byo-oss/entitlements/catalog"
import { describe, expect, it } from "vitest"

import { catalog, planDisplay, planIds, takesSeat } from "./catalog"

describe("the plan catalog", () => {
  it("lists the plans cheapest first, with Free as the default", () => {
    expect(planIds).toEqual(["free", "pro", "team"])
    expect(catalog.defaultPlan).toBe("free")
  })

  it("keeps the plan copy's promises", () => {
    expect(catalog.plans.free.limits).toEqual({
      requests: 10_000,
      seats: 3,
      agents: 2,
      runHistoryDays: 30,
    })
    expect(catalog.plans.pro.limits.seats).toBe(25)
    expect(catalog.plans.pro.limits.requests).toBe(100_000)
    expect(catalog.plans.team.limits.requests).toBe("unlimited")
    expect(catalog.plans.team.limits.seats).toBe("unlimited")
    // API keys are on every plan, so provisional signup's key (a Free organization) is fine.
    for (const id of planIds) expect(catalog.plans[id].features.apiKeys).toBe(true)
  })

  it("names the plan that unlocks a refusal", () => {
    expect(upgradeTo(catalog, { limit: "agents", atLeast: 3 })).toEqual(["pro", "team"])
    expect(upgradeTo(catalog, { feature: "sso" })).toEqual(["team"])
  })

  it("describes each plan", () => {
    expect(planDisplay("pro").name).toBe("Pro")
    expect(planDisplay("team").support).toBe("Priority")
  })

  it("states each plan's request cap in its copy", () => {
    const says = (id: "free" | "pro" | "team", line: string) =>
      expect(planDisplay(id).items).toContain(line)
    says("free", "10,000 API requests a day")
    says("pro", "100,000 API requests a day")
    says("team", "Unlimited API requests")
    // The copy and the limit are two writes of one number: keep them equal.
    for (const id of planIds) {
      const cap = catalog.plans[id].limits.requests
      const line =
        cap === "unlimited"
          ? "Unlimited API requests"
          : `${cap.toLocaleString("en-US")} API requests a day`
      expect(planDisplay(id).items).toContain(line)
    }
  })

  it("counts a seat for every role but viewer", () => {
    expect(takesSeat("viewer")).toBe(false)
    expect(takesSeat(" viewer ")).toBe(false)
    expect(takesSeat("member")).toBe(true)
    expect(takesSeat("viewer,approver")).toBe(true)
    expect(takesSeat("")).toBe(false)
  })
})
