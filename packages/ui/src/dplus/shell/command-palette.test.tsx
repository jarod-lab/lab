// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
// cmdk scrolls the active item into view and measures the list; jsdom has neither.
Element.prototype.scrollIntoView ??= () => {}
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

import { CommandPalette, type CommandPaletteProps } from "./command-palette"
import { byText, click, mount, typeInto } from "./test-helpers"

const groups: CommandPaletteProps["groups"] = [
  { heading: "Navigate", items: [{ id: "home", label: "Home", shortcut: ["G", "H"] }] },
  { heading: "Organizations", items: [{ id: "org-northwind", label: "Northwind Labs" }] },
]

function setup(overrides: Partial<CommandPaletteProps> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    groups,
    onSelect: vi.fn(),
    onAskAgent: vi.fn(),
    ...overrides,
  }
  return { props, h: mount(<CommandPalette {...props} />) }
}

describe("CommandPalette", () => {
  it("lists the groups, shortcuts and the ask entry", async () => {
    const { h } = setup()
    expect(byText("Home")).toBeTruthy()
    expect(byText("Northwind Labs")).toBeTruthy()
    expect(document.body.textContent).toContain("Ask an agent")
    const snapshot = document.body.innerHTML
    h.cleanup()
    await expectNoA11yViolations(snapshot)
  })

  it("selects an item, then closes", () => {
    const { props, h } = setup()
    click(byText("Northwind Labs"))
    expect(props.onSelect).toHaveBeenCalledWith("org-northwind")
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    h.cleanup()
  })

  it("asks an agent with what was typed, and echoes it in the entry", () => {
    const { props, h } = setup()
    const input = document.querySelector<HTMLInputElement>("input")
    if (!input) throw new Error("no input")
    typeInto(input, "why is run 4 slow")
    expect(document.body.textContent).toContain("Ask an agent: “why is run 4 slow”")
    click(document.querySelector('[cmdk-item][data-value="__ask-an-agent"]'))
    expect(props.onAskAgent).toHaveBeenCalledWith("why is run 4 slow")
    h.cleanup()
  })

  it("asks with an empty query when nothing was typed, and clears the query on close", () => {
    const { props, h } = setup()
    click(document.querySelector('[cmdk-item][data-value="__ask-an-agent"]'))
    expect(props.onAskAgent).toHaveBeenCalledWith("")
    h.cleanup()
    const again = setup({ open: true })
    const input = document.querySelector<HTMLInputElement>("input")
    if (!input) throw new Error("no input")
    typeInto(input, "abc")
    again.h.cleanup()
  })
})
