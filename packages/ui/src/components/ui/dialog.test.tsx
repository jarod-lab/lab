// @vitest-environment jsdom
import { act } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { mount } from "../../dplus/shell/test-helpers"
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from "./alert-dialog"
import { CommandDialog } from "./command"
import { Dialog, DialogContent, DialogTitle } from "./dialog"

const content = () => document.querySelector("[data-slot=dialog-content]")
const overlay = () => document.querySelector("[data-slot=dialog-overlay]")

function pressEscape() {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    )
  })
}

let cleanup = () => {}
afterEach(() => cleanup())

describe("Dialog", () => {
  it("animates an ordinary open and close", () => {
    ;({ cleanup } = mount(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Rename</DialogTitle>
        </DialogContent>
      </Dialog>,
    ))
    expect(content()?.hasAttribute("data-instant")).toBe(false)
    expect(overlay()?.hasAttribute("data-instant")).toBe(false)
    expect(content()?.className).toContain("data-instant:animate-none")
  })

  it("closes at once when Escape is pressed", () => {
    // Controlled and left open, so the popup is still there to inspect after the key.
    const onOpenChange = vi.fn()
    ;({ cleanup } = mount(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Rename</DialogTitle>
        </DialogContent>
      </Dialog>,
    ))
    pressEscape()
    expect(onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: "escape-key" }),
    )
    expect(content()?.hasAttribute("data-instant")).toBe(true)
    expect(overlay()?.hasAttribute("data-instant")).toBe(true)
  })

  it("never animates the command palette, which opens from the keyboard", () => {
    ;({ cleanup } = mount(
      <CommandDialog open>
        <p>Search</p>
      </CommandDialog>,
    ))
    expect(content()?.hasAttribute("data-instant")).toBe(true)
    expect(overlay()?.hasAttribute("data-instant")).toBe(true)
  })
})

describe("AlertDialog", () => {
  it("closes at once when Escape is pressed", () => {
    const onOpenChange = vi.fn()
    ;({ cleanup } = mount(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete?</AlertDialogTitle>
        </AlertDialogContent>
      </AlertDialog>,
    ))
    const popup = () => document.querySelector("[data-slot=alert-dialog-content]")
    expect(popup()?.hasAttribute("data-instant")).toBe(false)
    pressEscape()
    expect(onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: "escape-key" }),
    )
    expect(popup()?.hasAttribute("data-instant")).toBe(true)
  })
})
