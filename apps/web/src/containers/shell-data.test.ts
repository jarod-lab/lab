import { describe, expect, it } from "vitest"

import { activeOrganization, orgRoleLabel, toOrgSummaries } from "./shell-data"

describe("orgRoleLabel", () => {
  it("labels each role, and the highest of a comma-separated list", () => {
    expect(orgRoleLabel("owner")).toBe("Owner")
    expect(orgRoleLabel("admin")).toBe("Admin")
    expect(orgRoleLabel("member")).toBe("Member")
    expect(orgRoleLabel("viewer")).toBe("Viewer")
    expect(orgRoleLabel("member,admin")).toBe("Admin")
    expect(orgRoleLabel(" Owner , member ")).toBe("Owner")
  })

  it("shows Viewer for a role not known yet or a custom one", () => {
    expect(orgRoleLabel(undefined)).toBe("Viewer")
    expect(orgRoleLabel("auditor")).toBe("Viewer")
  })
})

describe("toOrgSummaries", () => {
  it("pairs each organization with its role", () => {
    const summaries = toOrgSummaries(
      [
        { id: "a", name: "Analytical", slug: "analytical" },
        { id: "b", name: "Babbage", slug: "babbage" },
      ],
      new Map([["a", "owner"]]),
    )
    expect(summaries).toEqual([
      { id: "a", name: "Analytical", slug: "analytical", role: "Owner" },
      { id: "b", name: "Babbage", slug: "babbage", role: "Viewer" },
    ])
  })
})

describe("activeOrganization", () => {
  const orgs = [{ id: "a", name: "Analytical", slug: "analytical" }]

  it("finds the session's active org among the caller's", () => {
    expect(
      activeOrganization(
        { user: { id: "u", email: "", name: "" }, activeOrganizationId: "a" },
        orgs,
      ),
    ).toEqual(orgs[0])
  })

  it("is undefined when there is no active org, or it is not the caller's", () => {
    const user = { id: "u", email: "", name: "" }
    expect(activeOrganization({ user, activeOrganizationId: null }, orgs)).toBeUndefined()
    expect(activeOrganization({ user, activeOrganizationId: "zzz" }, orgs)).toBeUndefined()
    expect(activeOrganization(null, orgs)).toBeUndefined()
  })
})
