import { describe, expect, it } from "vitest"
import { allowed, covers, intersect, type PermissionSet, union } from "./permissions"

describe("permission sets", () => {
  it("covers", () => {
    expect(covers({ a: ["x", "y"] }, { a: ["x"] })).toBe(true)
    expect(covers({ a: ["x"] }, { a: ["x", "y"] })).toBe(false)
    expect(covers({ a: ["x"] }, { b: ["x"] })).toBe(false)
    expect(covers({}, {})).toBe(true)
  })

  it("intersects and drops empty resources", () => {
    expect(intersect({ a: ["x", "y"], b: ["z"] }, { a: ["y"], c: ["q"] })).toEqual({ a: ["y"] })
  })

  it("unions without duplicates", () => {
    expect(union({ a: ["x"] }, { a: ["x", "y"], b: ["z"] })).toEqual({ a: ["x", "y"], b: ["z"] })
    expect(union()).toEqual({})
  })

  it("allows only when a single grant covers the whole request", () => {
    const grants: PermissionSet[] = [{ a: ["x"] }, { b: ["y"] }]
    expect(allowed(grants, { a: ["x"] })).toBe(true)
    expect(allowed(grants, { a: ["x"], b: ["y"] })).toBe(false)
    // Needing nothing is open to any authenticated caller, even one with no grants.
    expect(allowed([], {})).toBe(true)
    expect(allowed([], { a: ["x"] })).toBe(false)
  })
})
