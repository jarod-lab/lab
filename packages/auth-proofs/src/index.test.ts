import { describe, expect, it } from "vitest"
import { name } from "./index"

describe("gdp-ts", () => {
  it("wraps the named value", () => {
    expect(name("project-1", (id) => id.value)).toBe("project-1")
  })
})
