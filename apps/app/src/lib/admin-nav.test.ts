import { describe, expect, it } from "vitest"

import { adminCrumbs, adminLanding, adminTabs, canOpenAdmin } from "./admin-nav"

const none = { platformAdmin: false, operatorOrganizationId: null }

describe("adminTabs", () => {
  it("lists Users for a platform admin and Feature flags for the operator's members", () => {
    expect(adminTabs({ ...none, platformAdmin: true })).toEqual([
      { id: "users", label: "Users", href: "/admin/users" },
    ])
    expect(adminTabs({ ...none, operatorOrganizationId: "org-op" })).toEqual([
      { id: "flags", label: "Feature flags", href: "/admin/flags" },
    ])
    expect(
      adminTabs({ platformAdmin: true, operatorOrganizationId: "org-op" }).map((tab) => tab.id),
    ).toEqual(["users", "flags"])
  })

  it("adds Support for the operator's members whose role makes them support staff", () => {
    const operator = { ...none, operatorOrganizationId: "org-op" }
    expect(adminTabs({ ...operator, supportStaff: true }).map((tab) => tab.href)).toEqual([
      "/admin/flags",
      "/admin/support",
    ])
    expect(adminTabs({ ...operator, supportStaff: false }).map((tab) => tab.id)).toEqual(["flags"])
    // Support staff are always in the operator organization: no tab without it.
    expect(adminTabs({ ...none, supportStaff: true })).toEqual([])
  })

  it("opens nothing for anyone else", () => {
    expect(adminTabs(none)).toEqual([])
    expect(canOpenAdmin(none)).toBe(false)
    expect(canOpenAdmin({ ...none, operatorOrganizationId: "org-op" })).toBe(true)
  })
})

describe("adminLanding", () => {
  it("opens the first tab the person may open", () => {
    expect(adminLanding({ platformAdmin: true, operatorOrganizationId: "org-op" })).toBe(
      "/admin/users",
    )
    expect(adminLanding({ ...none, operatorOrganizationId: "org-op" })).toBe("/admin/flags")
    expect(adminLanding(none)).toBe("/admin/users")
  })
})

describe("adminCrumbs", () => {
  it("names the tab after Admin", () => {
    expect(adminCrumbs("/admin/flags")).toEqual([{ label: "Admin" }, { label: "Feature flags" }])
    expect(adminCrumbs("/admin/support/t1")).toEqual([{ label: "Admin" }, { label: "Support" }])
    expect(adminCrumbs("/admin")).toEqual([{ label: "Admin" }])
  })
})
