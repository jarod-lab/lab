import { describe, expect, it } from "vitest"

import { json, productFetch } from "../test/product-fetch"
import {
  canChangeRollout,
  errorRate,
  parseOrganizations,
  percentageSchema,
  targetsSchema,
  targetsSummary,
} from "./feature-flags"
import { createFeatureFlagsApi } from "./feature-flags-api"

describe("feature flag helpers", () => {
  it("summarizes targets", () => {
    expect(targetsSummary({ targetsOn: 2, targetsOff: 1 })).toBe("2 on · 1 off")
    expect(targetsSummary({ targetsOn: 0, targetsOff: 3 })).toBe("3 off")
    expect(targetsSummary({ targetsOn: 0, targetsOff: 0 })).toBe("None")
  })

  it("rates errors per 1,000 evaluations", () => {
    expect(errorRate(2000, 1)).toBe("0.5")
    expect(errorRate(0, 0)).toBe("–")
  })

  it("lets a rollout change only while declared and not reclaimed", () => {
    expect(canChangeRollout({ status: "ramping", inCatalog: true })).toBe(true)
    expect(canChangeRollout({ status: "reclaimed", inCatalog: true })).toBe(false)
    expect(canChangeRollout({ status: "orphaned", inCatalog: false })).toBe(false)
  })

  it("parses organizations from commas, spaces and lines", () => {
    expect(parseOrganizations(" acme, org_2\nacme  beta ")).toEqual(["acme", "org_2", "beta"])
    expect(parseOrganizations(" , ")).toEqual([])
  })

  it("validates the forms", () => {
    expect(percentageSchema.safeParse({ percentage: "25" }).success).toBe(true)
    expect(percentageSchema.safeParse({ percentage: "101" }).success).toBe(false)
    expect(percentageSchema.safeParse({ percentage: "2.5" }).success).toBe(false)
    expect(targetsSchema.safeParse({ organizations: "acme", value: "on" }).success).toBe(true)
    expect(targetsSchema.safeParse({ organizations: " ", value: "on" }).success).toBe(false)
    const many = Array.from({ length: 101 }, (_, i) => `o${i}`).join(",")
    expect(targetsSchema.safeParse({ organizations: many, value: "off" }).success).toBe(false)
  })
})

describe("createFeatureFlagsApi", () => {
  it("calls each operation for the organization", async () => {
    const { fetchImpl, sent } = productFetch((request) => {
      if (request.path === "/v1/me/operator-organization") return json({ organizationId: "org-1" })
      if (request.path === "/v1/feature-flags") return json({ flags: [{ key: "f" }] })
      if (request.method === "DELETE" && request.path === "/v1/feature-flags/f") {
        return json({ deleted: true })
      }
      return json({ key: "f" })
    })
    const api = createFeatureFlagsApi(fetchImpl)
    expect(await api.operatorOrganization()).toBe("org-1")
    expect(await api.list("org-1")).toEqual([{ key: "f" }])
    await api.get("org-1", "f")
    await api.update("org-1", "f", { percentage: 5 })
    await api.target("org-1", "f", ["acme"], false)
    await api.untarget("org-1", "f", "acme")
    await api.reclaim("org-1", "f", true)
    await api.remove("org-1", "f")
    expect(sent.map((s) => `${s.method} ${s.path}`)).toEqual([
      "GET /v1/me/operator-organization",
      "GET /v1/feature-flags",
      "GET /v1/feature-flags/f",
      "PATCH /v1/feature-flags/f",
      "POST /v1/feature-flags/f/targets",
      "DELETE /v1/feature-flags/f/targets/acme",
      "POST /v1/feature-flags/f/reclaim",
      "DELETE /v1/feature-flags/f",
    ])
    // The operator lookup is about the person; every rollout call names its organization.
    expect(sent[0]?.organization).toBeNull()
    expect(sent.slice(1).every((s) => s.organization === "org-1")).toBe(true)
    expect(sent[3]?.body).toEqual({ percentage: 5 })
    expect(sent[4]?.body).toEqual({ organizations: ["acme"], value: false })
    expect(sent[6]?.body).toEqual({ value: true })
  })

  it("throws the server's message and hint", async () => {
    const { fetchImpl } = productFetch(() =>
      json(
        {
          error: {
            code: "CONFLICT",
            message: "Flag f is reclaimed",
            hint: "Remove it from the code.",
          },
        },
        { status: 409 },
      ),
    )
    await expect(createFeatureFlagsApi(fetchImpl).update("org-1", "f", {})).rejects.toThrow(
      "Flag f is reclaimed Remove it from the code.",
    )
  })
})
