import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Button } from "./button"

describe("Button", () => {
  it("renders its variant and size classes", () => {
    const html = renderToStaticMarkup(
      <Button variant="outline" size="lg">
        Go
      </Button>,
    )
    expect(html).toContain("border-foreground")
    expect(html).toContain("h-10")
  })

  it("lets className override conflicting utilities", () => {
    expect(renderToStaticMarkup(<Button className="h-12" />)).toContain("h-12")
    expect(renderToStaticMarkup(<Button className="h-12" />)).not.toContain("h-8")
  })
})
