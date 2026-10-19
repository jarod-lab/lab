// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { PageBody, PageHeader } from "./page-header"

describe("PageHeader", () => {
  it("shows the title and context, padded at the bottom when nothing sits under it", async () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Overview" context="Acme Inc · you are Owner" />,
    )
    expect(html).toMatch(/<h1[^>]*>Overview<\/h1>/)
    expect(html).toContain("Acme Inc · you are Owner")
    expect(html).toContain("pb-5")
    await expectNoA11yViolations(html)
  })

  it("leaves the bottom to its children, such as tabs", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Settings">
        <p>tabs</p>
      </PageHeader>,
    )
    expect(html).toContain("<p>tabs</p>")
    expect(html).not.toContain("pb-5")
  })
})

describe("PageBody", () => {
  it("gives every page body the same width, keeping the page's own classes", () => {
    const html = renderToStaticMarkup(<PageBody className="gap-8">x</PageBody>)
    expect(html).toContain("max-w-[960px]")
    expect(html).toContain("gap-8")
    expect(html).not.toContain("gap-5")
  })
})
