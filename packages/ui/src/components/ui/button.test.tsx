import { cn } from "cn"
import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Button, buttonVariants } from "./button"

// Button is a plain function component, so call it and read the className it computed.
const classOf = (el: unknown) => (el as ReactElement<{ className: string }>).props.className

describe("Button", () => {
  it("computes classes from its variant and size", () => {
    expect(classOf(Button({ variant: "outline", size: "lg" }))).toBe(
      cn(buttonVariants({ variant: "outline", size: "lg" })),
    )
  })

  it("lets className override a conflicting size utility", () => {
    const heights = classOf(Button({ size: "sm", className: "h-12" }))
      .split(/\s+/)
      .filter((c) => /^h-\d/.test(c))
    expect(heights).toEqual(["h-12"])
  })

  it("renders and passes native props through", () => {
    expect(renderToStaticMarkup(<Button disabled>Go</Button>)).toMatch(/<button[^>]*disabled/)
  })
})
