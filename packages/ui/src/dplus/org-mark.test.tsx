import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { OrgMark } from "./org-mark"

describe("OrgMark", () => {
  it("shows the first letter, capitalised, and hides itself from assistive tech", () => {
    const html = renderToStaticMarkup(<OrgMark name=" acme Inc" />)
    expect(html).toMatch(/aria-hidden="true"[^>]*>A<\/span>$/)
  })

  it("falls back for an empty name", () => {
    expect(renderToStaticMarkup(<OrgMark name="" />)).toContain(">?</span>")
  })

  it.each([
    ["filled", "bg-primary"],
    ["outline", "border-foreground"],
    ["personal", "border-dashed"],
  ] as const)("%s look", (look, cls) => {
    expect(renderToStaticMarkup(<OrgMark name="N" look={look} />)).toContain(cls)
  })

  it.each([
    ["sm", "size-7 "],
    ["default", "size-7.5"],
    ["lg", "size-12"],
  ] as const)("%s size", (size, cls) => {
    expect(renderToStaticMarkup(<OrgMark name="N" size={size} />)).toContain(cls)
  })
})
