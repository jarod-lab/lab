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
    const html = renderToStaticMarkup(wrap(<Topbar crumbs={crumbs} inbox={{ count: 3 }} />))
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('href="/acme"')
    expect(html).toContain('aria-label="Inbox, 3 need you"')
    await expectNoA11yViolations(html)
  })

  it("shows an empty inbox without a count", () => {
    const html = renderToStaticMarkup(wrap(<Topbar crumbs={crumbs} inbox={{ count: 0 }} />))
    expect(html).toContain('aria-label="Inbox, nothing needs you"')
  })

  it("renders the phone menu button only when asked", () => {
    expect(renderToStaticMarkup(wrap(<Topbar crumbs={crumbs} showMenuButton />))).toContain(
      'aria-label="Open navigation"',
    )
    expect(renderToStaticMarkup(wrap(<Topbar crumbs={crumbs} />))).not.toContain("Open navigation")
  })

  it("opens search and the inbox from their triggers", () => {
    const onOpenSearch = vi.fn()
    const onOpen = vi.fn()
    const h = mount(
      wrap(<Topbar crumbs={crumbs} onOpenSearch={onOpenSearch} inbox={{ count: 1, onOpen }} />),
    )
    click(byText("Search or ask an agent"))
    expect(onOpenSearch).toHaveBeenCalledOnce()
    click(document.querySelector('[aria-label="Inbox, 1 need you"]'))
    expect(onOpen).toHaveBeenCalledOnce()
    h.cleanup()
  })

  it("renders the notifications slot just before the inbox button", () => {
    const html = renderToStaticMarkup(
      wrap(
        <Topbar
          crumbs={crumbs}
          inbox={{ count: 0 }}
          notifications={<button type="button">Bell slot</button>}
        />,
      ),
    )
    expect(html).toContain("Bell slot")
    expect(html.indexOf("Bell slot")).toBeLessThan(html.indexOf("Inbox, nothing needs you"))
  })

  it("renders a crumb with no link as plain text", () => {
    const props: TopbarProps = { crumbs: [{ label: "Plain" }, { label: "Here" }] }
    expect(renderToStaticMarkup(wrap(<Topbar {...props} />))).toContain("Plain")
  })
})
