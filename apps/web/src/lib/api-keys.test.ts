import { describe, expect, it } from "vitest"

import {
  accessSummary,
  isUnused,
  permissionOptions,
  secretNotice,
  toPermissionsRecord,
} from "./api-keys"

describe("permissionOptions", () => {
  it("offers only product resources, never approve or owner-only ones", () => {
    const all = permissionOptions(() => true)
    const keys = all.map((option) => option.key)
    expect(keys).toContain("project:read")
    expect(keys).toContain("run:steer")
    expect(keys).not.toContain("run:approve")
    expect(
      keys.some((key) => /^(sso|scim|subscription|twoFactor|organization|member)/.test(key)),
    ).toBe(false)
  })

  it("keeps only what the caller may grant", () => {
    const viewerLike = (permission: Record<string, string[]>) =>
      Object.values(permission)
        .flat()
        .every((action) => action === "read")
    expect(permissionOptions(viewerLike).map((option) => option.key)).toEqual([
      "project:read",
      "agent:read",
      "run:read",
    ])
  })
})

describe("toPermissionsRecord", () => {
  it("groups selected keys into the server's resource to actions record", () => {
    expect(toPermissionsRecord(["project:read", "project:create", "agent:read"])).toEqual({
      project: ["read", "create"],
      agent: ["read"],
    })
  })
})

describe("accessSummary", () => {
  it("names read-only keys, read and write keys, and keys with nothing", () => {
    expect(accessSummary(["project:read", "agent:read"])).toBe("Read only")
    expect(accessSummary(["project:read", "project:update"])).toBe("Read & write")
    expect(accessSummary([])).toBe("No access")
  })
})

describe("isUnused", () => {
  const now = new Date("2026-10-16T12:00:00Z")
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

  it("flags a key not used for 90 days", () => {
    expect(isUnused({ lastUsedAt: daysAgo(91), createdAt: daysAgo(200) }, now)).toBe(true)
    expect(isUnused({ lastUsedAt: daysAgo(2), createdAt: daysAgo(200) }, now)).toBe(false)
  })

  it("counts a key never used from when it was created", () => {
    expect(isUnused({ lastUsedAt: null, createdAt: daysAgo(91) }, now)).toBe(true)
    expect(isUnused({ lastUsedAt: null, createdAt: daysAgo(3) }, now)).toBe(false)
  })
})

describe("secretNotice", () => {
  it("says the key is shown only once", () => {
    expect(secretNotice("CI deploy")).toBe("Copy “CI deploy” now. You won't see this key again.")
  })
})
