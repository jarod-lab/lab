// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { SidebarProvider } from "../../components/ui/sidebar"
import { demoAccount, demoNav, demoOrgs, demoPinned } from "../pages/story-kit"
import { AppSidebar, type AppSidebarProps } from "./app-sidebar"
import { byText, click, mount } from "./test-helpers"

const props: AppSidebarProps = {
  org: {
    orgs: demoOrgs,
    activeOrgId: "acme",
    hrefFor: (o) => `/${o.slug}`,
    settingsHref: "/acme/settings",
    createHref: "/new",
  },
  nav: demoNav,
  activeId: "agents",
  pinnedAgents: demoPinned,
  announcement: { id: "pr", badge: "NEW", title: "Agents can open pull requests", href: "/post" },
  support: { href: "/support" },
  account: demoAccount,
}

const frame = (ui: React.ReactElement) => <SidebarProvider>{ui}</SidebarProvider>

describe("AppSidebar", () => {
  it("marks the current nav item and renders the workspace, pinned agents and support", async () => {
    const html = renderToStaticMarkup(frame(<AppSidebar {...props} />))
    expect(html).toMatch(/aria-current="page"[^>]*>|aria-current="page"/)
    expect(html).toContain("2 running")
    expect(html).toContain("3 waiting")
    expect(html).toContain("Pinned agents")
    expect(html).toContain('href="/support"')
    await expectNoA11yViolations(html)
  })

  it("says so when no agents are pinned, and shows no announcement without one", () => {
    const html = renderToStaticMarkup(
      frame(<AppSidebar {...props} pinnedAgents={[]} announcement={undefined} />),
    )
    expect(html).toContain("Pin an agent to see it here.")
    expect(html).not.toContain('aria-label="Announcement"')
  })

  it("dismisses the announcement locally and tells the parent", () => {
    const onDismiss = vi.fn()
    const h = mount(frame(<AppSidebar {...props} onDismissAnnouncement={onDismiss} />))
    expect(document.querySelector('[aria-label="Announcement"]')).not.toBeNull()
    click(document.querySelector('[aria-label^="Dismiss announcement"]'))
    expect(document.querySelector('[aria-label="Announcement"]')).toBeNull()
    expect(onDismiss).toHaveBeenCalledWith("pr")
    h.cleanup()
  })

  it("renders the announcement link through the renderer and defaults the support label", () => {
    const h = mount(
      frame(
        <AppSidebar
          {...props}
          announcement={{ id: "x", title: "Hi", href: "/post", linkLabel: "Read the post" }}
        />,
      ),
    )
    expect(byText("Read the post")).toBeTruthy()
    expect(byText("Support")).toBeTruthy()
    h.cleanup()
  })

  it("supports an announcement with no link or badge", () => {
    const html = renderToStaticMarkup(
      frame(<AppSidebar {...props} announcement={{ id: "y", title: "Plain news" }} />),
    )
    expect(html).toContain("Plain news")
    expect(html).not.toContain("Read more")
  })
})
