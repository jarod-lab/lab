import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { anchorLink, ShellLinkProvider, useRenderLink } from "./link"

function Probe({ override }: { override?: typeof anchorLink }) {
  const render = useRenderLink(override)
  return render({ href: "/acme", children: "Acme" })
}

describe("shell links", () => {
  it("defaults to a plain anchor", () => {
    expect(renderToStaticMarkup(anchorLink({ href: "/x", children: "X" }))).toBe(
      '<a href="/x">X</a>',
    )
  })

  it("uses the nearest provider's renderer, and an explicit one over both", () => {
    const router: typeof anchorLink = (p) => <span data-router="" {...p} />
    expect(
      renderToStaticMarkup(
        <ShellLinkProvider renderLink={router}>
          <Probe />
        </ShellLinkProvider>,
      ),
    ).toContain("data-router")
    expect(
      renderToStaticMarkup(
        <ShellLinkProvider renderLink={router}>
          <Probe override={anchorLink} />
        </ShellLinkProvider>,
      ),
    ).toBe('<a href="/acme">Acme</a>')
    expect(renderToStaticMarkup(<Probe />)).toBe('<a href="/acme">Acme</a>')
  })
})
