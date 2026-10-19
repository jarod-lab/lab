import { describe, expect, it } from "vitest"

import { activeNavFor, settingsCrumbs } from "./org-nav"
import { settingsTabs } from "./org-settings"

describe("activeNavFor", () => {
  it("maps the org's paths to their sidebar item", () => {
    expect(activeNavFor("/acme", "acme")).toBe("home")
    expect(activeNavFor("/acme/", "acme")).toBe("home")
    expect(activeNavFor("/acme/settings/agents", "acme")).toBe("agents")
    expect(activeNavFor("/acme/settings/general", "acme")).toBe("settings")
  })

  it("keeps a run under Home, and is undefined outside the org", () => {
    expect(activeNavFor("/acme/runs/1", "acme")).toBe("home")
  })

  it("is undefined for a path outside the org or a page without a nav item", () => {
    expect(activeNavFor("/other", "acme")).toBeUndefined()
    expect(activeNavFor("/acme/settingsx", "acme")).toBeUndefined()
  })
})

describe("the operator's settings tab", () => {
  it("is listed only for the operator organization, and has its crumb", () => {
    expect(settingsTabs("acme").map((tab) => tab.id)).not.toContain("flags")
    expect(settingsTabs("acme", true).at(-1)).toEqual({
      id: "flags",
      label: "Feature flags",
      href: "/acme/settings/flags",
    })
    expect(settingsCrumbs("/acme/settings/flags", "acme")).toEqual([
      { label: "Settings" },
      { label: "Feature flags" },
    ])
  })
})
