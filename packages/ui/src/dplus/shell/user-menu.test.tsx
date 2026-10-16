// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { initialsOf, UserMenu, type UserMenuProps } from "./user-menu"
import { byText, click, mount } from "./test-helpers"

const base: UserMenuProps = {
  user: { name: "Jordan Lee", email: "jordan@acme.dev" },
  theme: "light",
  onThemeChange: () => {},
  personalSettingsHref: "/account/profile",
  securityHref: "/account/security",
  onShowShortcuts: () => {},
  onSignOut: () => {},
}

describe("initialsOf", () => {
  it("takes the first letter of the first two words", () => {
    expect(initialsOf("jordan lee")).toBe("JL")
    expect(initialsOf("Ada")).toBe("A")
    expect(initialsOf("  ")).toBe("?")
  })
})

describe("UserMenu", () => {
  it("labels the trigger with the account name", async () => {
    const html = renderToStaticMarkup(<UserMenu {...base} />)
    expect(html).toContain('aria-label="Account menu, Jordan Lee"')
    await expectNoA11yViolations(html)
  })

  it("holds the account items, theme radios and sign out when open", async () => {
    const h = mount(<UserMenu {...base} open />)
    expect(byText("Personal settings").closest("a")?.getAttribute("href")).toBe("/account/profile")
    expect(byText("Security").closest("a")?.getAttribute("href")).toBe("/account/security")
    expect(byText("Keyboard shortcuts")).toBeTruthy()
    expect(byText("System")).toBeTruthy()
    const snapshot = document.body.innerHTML
    h.cleanup()
    await expectNoA11yViolations(snapshot)
  })

  it("calls the callbacks for shortcuts, theme and sign out", () => {
    const onShowShortcuts = vi.fn()
    const onThemeChange = vi.fn()
    const onSignOut = vi.fn()
    const h = mount(
      <UserMenu
        {...base}
        open
        onShowShortcuts={onShowShortcuts}
        onThemeChange={onThemeChange}
        onSignOut={onSignOut}
      />,
    )
    click(byText("Keyboard shortcuts"))
    expect(onShowShortcuts).toHaveBeenCalledOnce()
    click(byText("Dark"))
    expect(onThemeChange).toHaveBeenCalledWith("dark")
    h.cleanup()
    const h2 = mount(<UserMenu {...base} open onSignOut={onSignOut} />)
    click(byText("Sign out"))
    expect(onSignOut).toHaveBeenCalledOnce()
    h2.cleanup()
  })

  it("hides the shortcuts item when no handler is given", () => {
    const h = mount(<UserMenu {...base} open onShowShortcuts={undefined} />)
    expect(document.body.textContent).not.toContain("Keyboard shortcuts")
    h.cleanup()
  })
})
