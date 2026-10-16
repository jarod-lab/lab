import { act, type ReactElement } from "react"
import { createRoot } from "react-dom/client"

// Test-only: mounts into jsdom so interactions (clicks, typing) run through React.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no matchMedia; the sidebar's mobile check reads it.
if (!window.matchMedia) {
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
    }) as unknown as MediaQueryList
}

/** Mount a component into a fresh container under document.body. Call `cleanup` when done. */
export function mount(ui: ReactElement) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return {
    container,
    cleanup() {
      // A check that replaces <body> may have detached the container already.
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

/** Click a node (menus and triggers listen for click in jsdom). */
export function click(el: Element | null) {
  if (!el) throw new Error("click: element not found")
  act(() => {
    ;(el as HTMLElement).click()
  })
}

/** Find by visible text or aria-label inside the document, including portals. */
export function byText(text: string | RegExp, root: ParentNode = document): HTMLElement {
  const matches = Array.from(root.querySelectorAll<HTMLElement>("*")).filter((el) => {
    const label = el.getAttribute("aria-label") ?? ""
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim()
    const hit = (s: string) => (typeof text === "string" ? s === text : text.test(s))
    return hit(own) || hit(label) || (hit(el.textContent?.trim() ?? "") && el.children.length === 0)
  })
  const found = matches[0]
  if (!found) throw new Error(`byText: no element matching ${String(text)}`)
  return found
}

/** Type into a controlled input so React's onChange fires. */
export function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
