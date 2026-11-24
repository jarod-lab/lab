import { describe, expect, it } from "vitest"

import { safeNext } from "./next-path"

describe("safeNext", () => {
  it("keeps /approvals, ignores //evil.example, https://evil.example, javascript:alert(1) and the empty value", () => {
    expect(safeNext("/approvals")).toBe("/approvals")
    expect(safeNext("/approvals?tab=decided")).toBe("/approvals?tab=decided")
    expect(safeNext("//evil.example")).toBe("/digest")
    expect(safeNext("https://evil.example")).toBe("/digest")
    expect(safeNext("javascript:alert(1)")).toBe("/digest")
    expect(safeNext("")).toBe("/digest")
    expect(safeNext(undefined)).toBe("/digest")
  })

  it("ignores backslash, whitespace, control and colon tricks", () => {
    for (const next of [
      "/\\evil.example",
      "/\\/evil.example",
      "\\\\evil.example",
      "/ //evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/a:b",
      "/https://evil.example",
      "approvals",
      "///evil.example",
      "//\\evil.example",
    ]) {
      expect(safeNext(next), JSON.stringify(next)).toBe("/digest")
    }
  })

  it("ignores a value that is not a string", () => {
    expect(safeNext(42 as unknown as string)).toBe("/digest")
    expect(safeNext(null as unknown as string)).toBe("/digest")
  })
})
