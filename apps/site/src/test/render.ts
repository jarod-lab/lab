import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * Server-renders an element the way Astro does (static HTML, no hydration), mounts it as the
 * document body, and returns the markup for `expectNoA11yViolations`.
 */
export function render(element: ReactElement): string {
  const html = renderToStaticMarkup(element)
  document.body.replaceChildren(document.createRange().createContextualFragment(html))
  return html
}

/** The links whose text is exactly `text`. */
export function linksNamed(text: string): HTMLAnchorElement[] {
  return [...document.querySelectorAll("a")].filter((a) => a.textContent?.trim() === text)
}
