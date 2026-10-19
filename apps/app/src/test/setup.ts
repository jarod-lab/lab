import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

// Turbo runs every package's tests at once, and under that load a page's first render can pass
// Testing Library's 1s default for findBy*/waitFor (seen at 1.4s). 5s keeps real failures failing.
configure({ asyncUtilTimeout: 5000 })

// Vitest runs without globals, so Testing Library's automatic cleanup is not registered.
afterEach(() => {
  cleanup()
})

// jsdom has neither; cmdk (the command palette) needs both to lay out its list.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no matchMedia; the sidebar's breakpoint hook calls it. Light and wide by default.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
