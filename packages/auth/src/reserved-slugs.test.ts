import { describe, expect, it } from "vitest"
import { isReservedOrgSlug, RESERVED_ORG_SLUGS, slugOf } from "./reserved-slugs"

describe("reserved organization slugs", () => {
  it("reserves every app path segment, case-insensitively", () => {
    for (const slug of RESERVED_ORG_SLUGS) expect(isReservedOrgSlug(slug)).toBe(true)
    expect(isReservedOrgSlug("Admin ")).toBe(true)
    expect(isReservedOrgSlug("acme")).toBe(false)
  })

  it("derives the slug a name would get", () => {
    expect(slugOf("Two Factor!")).toBe("two-factor")
    expect(slugOf("  Auth  ")).toBe("auth")
  })
})
