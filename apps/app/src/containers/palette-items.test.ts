import { describe, expect, it } from "vitest"

import { goId, paletteAction, paletteGroups, themeId } from "./palette-items"

const orgs = [
  { id: "a", name: "Analytical", slug: "analytical" },
  { id: "b", name: "Babbage", slug: "babbage" },
]

describe("paletteGroups", () => {
  it("offers the current org's pages, every org to switch to, create, and the theme", () => {
    const groups = paletteGroups({ current: orgs[0] ?? null, organizations: orgs })
    const items = groups.flatMap((group) => group.items.map((item) => item.id))
    expect(items).toEqual([
      goId("/analytical"),
      goId("/analytical/settings/agents"),
      goId("/analytical/settings/general"),
      goId("/account/profile"),
      goId("/analytical"),
      goId("/babbage"),
      goId("/new"),
      themeId("light"),
      themeId("dark"),
      themeId("system"),
    ])
    expect(groups.map((group) => group.heading)).toEqual([
      "Navigation",
      "Organizations",
      "Actions",
      "Theme",
    ])
  })

  it("leaves out the org pages when there is no current org", () => {
    const groups = paletteGroups({ current: null, organizations: [] })
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["Account"])
  })
})

describe("paletteAction", () => {
  it("decodes navigation and theme ids, and ignores anything else", () => {
    expect(paletteAction(goId("/new"))).toEqual({ kind: "navigate", href: "/new" })
    expect(paletteAction(themeId("dark"))).toEqual({ kind: "theme", choice: "dark" })
    expect(paletteAction("theme:neon")).toBeNull()
    expect(paletteAction("unknown")).toBeNull()
  })
})
