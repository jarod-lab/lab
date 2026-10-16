// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { SettingsHeader, type SettingsHeaderProps } from "./settings-header"

const base: SettingsHeaderProps = {
  title: "Organization settings",
  context: "Acme Inc · you are Owner",
  tabs: [
    { id: "general", label: "General", href: "/acme/settings/general" },
    { id: "members", label: "Members", href: "/acme/settings/members", count: "12" },
    { id: "integrations", label: "Integrations", href: "/x", badge: "1 expired" },
  ],
  activeTab: "members",
}

describe("SettingsHeader", () => {
  it("marks the active tab and shows counts and badges", async () => {
    const html = renderToStaticMarkup(<SettingsHeader {...base} />)
    expect(html).toMatch(/aria-current="page"[^>]*>Members/)
    expect(html).toContain("12")
    expect(html).toContain("1 expired")
    await expectNoA11yViolations(html)
  })

  it("adds level-2 pills beside the title, with the active one current", async () => {
    const html = renderToStaticMarkup(
      <SettingsHeader
        {...base}
        activeTab="profile"
        tabs={[{ id: "profile", label: "Profile", href: "/p" }]}
        pills={[
          { id: "all", label: "All", href: "/all" },
          { id: "keys", label: "Keys", href: "/keys" },
        ]}
        activePill="keys"
      />,
    )
    expect(html).toMatch(/aria-current="page"[^>]*>Keys/)
    await expectNoA11yViolations(html)
  })

  it("shows the view-only notice for a viewer", async () => {
    const html = renderToStaticMarkup(<SettingsHeader {...base} viewOnly="Acme Inc" />)
    expect(html).toContain("You have view-only access to Acme Inc.")
    await expectNoA11yViolations(html)
  })
})
