import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Meter } from "./meter"

const cells = (html: string) => html.match(/data-slot="meter-cell"/g)?.length ?? 0
const used = (html: string) => html.match(/data-used=""/g)?.length ?? 0

describe("Meter", () => {
  it("draws one cell per unit and fills the used ones", () => {
    const html = renderToStaticMarkup(<Meter value={12} max={15} label="12 of 15 seats used" />)
    expect(cells(html)).toBe(15)
    expect(used(html)).toBe(12)
    expect(html).toMatch(/<meter[^>]*max="15"[^>]*value="12"/)
    expect(html).toContain('aria-label="12 of 15 seats used"')
  })

  it("clamps out-of-range values", () => {
    expect(used(renderToStaticMarkup(<Meter value={20} max={3} label="x" />))).toBe(3)
    expect(used(renderToStaticMarkup(<Meter value={-1} max={3} label="x" />))).toBe(0)
    expect(cells(renderToStaticMarkup(<Meter value={1} max={-2} label="x" />))).toBe(0)
  })

  it("has tall cells for seats", () => {
    expect(renderToStaticMarkup(<Meter value={1} max={2} label="x" cell="tall" />)).toContain(
      "h-4.5 w-3",
    )
  })
})
