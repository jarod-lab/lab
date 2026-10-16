import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Shortcut } from "./shortcut"

describe("Shortcut", () => {
  it("renders one keycap per key, pushed to the end", () => {
    const html = renderToStaticMarkup(<Shortcut keys={["G", "A"]} className="x" />)
    expect(html.match(/<kbd data-slot="kbd"/g)).toHaveLength(2)
    expect(html).toContain("ml-auto")
    expect(html).toContain("x")
  })
})
