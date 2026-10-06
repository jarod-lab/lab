import { describe, expect, it } from "vitest"

// Smoke test: every vendored shadcn component must import cleanly (catches broken aliases and
// missing dependencies, which typecheck alone can miss) and export something.
const modules = import.meta.glob(["./*.tsx", "!./*.test.tsx", "!./*.stories.tsx"], { eager: true })

describe("shadcn components", () => {
  it("found the components", () => {
    expect(Object.keys(modules).length).toBeGreaterThan(40)
  })

  it.each(Object.entries(modules))("%s exports components", (_path, mod) => {
    expect(Object.keys(mod as object).length).toBeGreaterThan(0)
  })
})
