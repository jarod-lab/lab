import { describe, expect, it } from "vitest"

import { activeNavFor } from "./org-nav"

describe("activeNavFor", () => {
  it("maps the org's paths to their sidebar item", () => {
    expect(activeNavFor("/acme", "acme")).toBe("home")
    expect(activeNavFor("/acme/", "acme")).toBe("home")
    expect(activeNavFor("/acme/settings/agents", "acme")).toBe("agents")
    expect(activeNavFor("/acme/settings/general", "acme")).toBe("settings")
  })

  it("is undefined for a path outside the org or a page without a nav item", () => {
    expect(activeNavFor("/acme/runs/1", "acme")).toBeUndefined()
    expect(activeNavFor("/other", "acme")).toBeUndefined()
    expect(activeNavFor("/acme/settingsx", "acme")).toBeUndefined()
  })
})
