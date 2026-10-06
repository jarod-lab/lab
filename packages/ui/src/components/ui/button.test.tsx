import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Button, buttonVariants } from "./button"

const classesOf = (html: string) =>
  (html.match(/class="([^"]*)"/)?.[1] ?? "").replaceAll("&amp;", "&").split(/\s+/)

describe("Button", () => {
  it("renders the classes for its variant and size", () => {
    const html = renderToStaticMarkup(
      <Button variant="outline" size="lg">
        Go
      </Button>,
    )
    const rendered = classesOf(html)
    for (const cls of buttonVariants({ variant: "outline", size: "lg" }).split(" ")) {
      expect(rendered).toContain(cls)
    }
  })

  it("lets className override conflicting utilities", () => {
    const html = renderToStaticMarkup(<Button size="sm" className="h-12" />)
    expect(classesOf(html)).toContain("h-12")
    expect(classesOf(html)).not.toContain("h-8")
  })

  it("passes native props through", () => {
    expect(renderToStaticMarkup(<Button disabled>x</Button>)).toContain("disabled")
  })
})
