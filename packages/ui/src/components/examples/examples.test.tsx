import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

// Render every shadcn example on the server. Catches demos that throw, import something that
// doesn't exist, or need a provider they don't bring along. (Typecheck can't see runtime errors.)
const examples = import.meta.glob<{ default: React.ComponentType }>("./*-example.tsx", {
  eager: true,
})

describe("shadcn examples", () => {
  it("found the examples", () => {
    expect(Object.keys(examples).length).toBeGreaterThan(40)
  })

  it.each(Object.entries(examples))("%s renders", (_path, mod) => {
    const Example = mod.default
    expect(renderToStaticMarkup(<Example />).length).toBeGreaterThan(0)
  })
})
