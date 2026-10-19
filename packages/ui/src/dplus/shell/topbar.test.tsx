// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { SidebarProvider } from "../../components/ui/sidebar"
import { byText, click, mount } from "./test-helpers"
import { Topbar, type TopbarProps } from "./topbar"

const crumbs = [{ label: "Acme Inc", href: "/acme" }, { label: "Settings" }, { label: "Members" }]

const wrap = (ui: React.ReactElement) => <SidebarProvider>{ui}</SidebarProvider>

describe("Topbar", () => {
  it("marks the last crumb as the current page and links the rest", async () => {
    const html = renderToStaticMarkup(wrap(<Topbar crumbs={crumbs} />))
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('href="/acme"')
    await expectNoA11yViolations(html)
  })

  it("renders the phone menu button only when asked", () => {
    expect(renderToStaticMarkup(wrap(<Topbar crumbs={crumbs} showMenuButton />))).toContain(
      'aria-label="Open navigation"',
    )
    expect(renderToStaticMarkup(wrap(<Topbar crumbs={crumbs} />))).not.toContain("Open navigation")
  })

  it("opens search from its trigger", () => {
    const onOpenSearch = vi.fn()
    const h = mount(wrap(<Topbar crumbs={crumbs} onOpenSearch={onOpenSearch} />))
    click(byText("Search or ask an agent"))
    expect(onOpenSearch).toHaveBeenCalledOnce()
    h.cleanup()
  })

  it("renders the notifications slot after the search trigger", () => {
    const html = renderToStaticMarkup(
      wrap(<Topbar crumbs={crumbs} notifications={<button type="button">Bell slot</button>} />),
    )
    expect(html).toContain("Bell slot")
    expect(html.indexOf("Search or ask an agent")).toBeLessThan(html.indexOf("Bell slot"))
  })

  it("renders a crumb with no link as plain text", () => {
    const props: TopbarProps = { crumbs: [{ label: "Plain" }, { label: "Here" }] }
    expect(renderToStaticMarkup(wrap(<Topbar {...props} />))).toContain("Plain")
  })
})
