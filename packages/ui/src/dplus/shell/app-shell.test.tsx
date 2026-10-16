// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { AppShell } from "./app-shell"
import { anchorLink } from "./link"

describe("AppShell", () => {
  it("puts a skip link first and a focusable main as its target", async () => {
    const html = renderToStaticMarkup(
      <AppShell sidebar={<nav aria-label="Side" />} topbar={<header />}>
        <p>Body</p>
      </AppShell>,
    )
    expect(html.indexOf('href="#main"')).toBeLessThan(html.indexOf('aria-label="Side"'))
    expect(html).toContain('<main id="main" tabindex="-1"')
    expect(html).toContain("Skip to content")
    await expectNoA11yViolations(html)
  })

  it("accepts a custom skip label and a router link for the children", () => {
    const html = renderToStaticMarkup(
      <AppShell
        sidebar={null}
        topbar={null}
        skipLinkLabel="Jump to content"
        renderLink={anchorLink}
      >
        x
      </AppShell>,
    )
    expect(html).toContain("Jump to content")
  })
})
