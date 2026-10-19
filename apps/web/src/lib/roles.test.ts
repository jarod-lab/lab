import { describe, expect, it } from "vitest"

import { hasRole, isOrgRole, isOwner, roleParts } from "./roles"

describe("roleParts", () => {
  it("splits a stored role string into trimmed, non-empty parts", () => {
    expect(roleParts(" admin, member ")).toEqual(["admin", "member"])
    expect(roleParts("")).toEqual([])
  })
})

describe("hasRole", () => {
  it("checks a single role inside a stored role string", () => {
    expect(hasRole("admin, owner", "owner")).toBe(true)
    expect(hasRole("admin,member", "owner")).toBe(false)
  })

  it("matches whole roles, never a substring", () => {
    expect(hasRole("ownership", "owner")).toBe(false)
  })
})

describe("isOwner", () => {
  it("is true only when the owner role is among the parts", () => {
    expect(isOwner("owner")).toBe(true)
    expect(isOwner("admin, owner")).toBe(true)
    expect(isOwner("admin,member")).toBe(false)
    expect(isOwner("")).toBe(false)
  })
})

describe("isOrgRole", () => {
  it("accepts one catalog role and refuses lists and unknown names", () => {
    expect(isOrgRole("viewer")).toBe(true)
    expect(isOrgRole("owner")).toBe(true)
    expect(isOrgRole("admin,member")).toBe(false)
    expect(isOrgRole("superuser")).toBe(false)
    expect(isOrgRole("constructor")).toBe(false)
  })
})
