import { describe, expect, it } from "vitest"

import {
  countOrPlaceholder,
  defaultInviteRoleOf,
  ownerCount,
  parseMetadata,
  slugChangeWarning,
  withDefaultInviteRole,
} from "./org-settings"

describe("parseMetadata", () => {
  it("reads an object, a JSON string, and treats anything else as empty", () => {
    expect(parseMetadata({ a: 1 })).toEqual({ a: 1 })
    expect(parseMetadata('{"a":1}')).toEqual({ a: 1 })
    expect(parseMetadata("not json")).toEqual({})
    expect(parseMetadata(["x"])).toEqual({})
    expect(parseMetadata(null)).toEqual({})
  })
})

describe("default invite role", () => {
  it("defaults to Member, and reads a stored role from either metadata shape", () => {
    expect(defaultInviteRoleOf(undefined)).toBe("member")
    expect(defaultInviteRoleOf({ defaultInviteRole: "viewer" })).toBe("viewer")
    expect(defaultInviteRoleOf('{"defaultInviteRole":"admin"}')).toBe("admin")
    expect(defaultInviteRoleOf({ defaultInviteRole: "owner" })).toBe("member")
  })

  it("accepts the capability roles, and reads any other stored value as Member", () => {
    expect(defaultInviteRoleOf({ defaultInviteRole: "approver" })).toBe("approver")
    expect(defaultInviteRoleOf({ defaultInviteRole: "operator" })).toBe("operator")
    expect(defaultInviteRoleOf({ defaultInviteRole: "billing" })).toBe("billing")
    expect(defaultInviteRoleOf({ defaultInviteRole: "superuser" })).toBe("member")
  })

  it("keeps every other metadata key when it sets the role", () => {
    expect(withDefaultInviteRole({ region: "eu" }, "viewer")).toEqual({
      region: "eu",
      defaultInviteRole: "viewer",
    })
    expect(withDefaultInviteRole('{"region":"eu"}', "admin")).toEqual({
      region: "eu",
      defaultInviteRole: "admin",
    })
  })
})

describe("roles and owners", () => {
  it("counts the members who hold the owner role, even alongside other roles", () => {
    expect(
      ownerCount([
        { id: "1", userId: "u1", role: "owner" },
        { id: "2", userId: "u2", role: "admin,owner" },
        { id: "3", userId: "u3", role: "member" },
      ]),
    ).toBe(2)
  })
})

describe("copy", () => {
  it("names the old address in the slug warning", () => {
    expect(slugChangeWarning("app.example.com", "acme")).toBe(
      "Changing this breaks existing links to app.example.com/acme.",
    )
  })

  it("shows a placeholder until a count is known", () => {
    expect(countOrPlaceholder(undefined)).toBe("[PLACEHOLDER]")
    expect(countOrPlaceholder(0)).toBe("0")
  })
})
