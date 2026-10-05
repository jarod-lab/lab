import { describe, expect, it } from "vitest"
import { cn } from "./index"

describe("cn", () => {
  it("merges conflicting Tailwind classes", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4")
  })

  it("joins conditionally", () => {
    const off = Math.random() > 2
    expect(cn("a", off && "b", { c: true })).toBe("a c")
  })
})
