// @vitest-environment jsdom
import { act } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { CopyField } from "./copy-field"
import { byText, click, mount } from "./test-helpers"

function setClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
}

describe("CopyField", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders the value read-only with a Copy button", async () => {
    const html = renderToStaticMarkup(<CopyField label="Org ID" value="org_123" />)
    expect(html).toContain("readOnly")
    expect(html).toContain("org_123")
    expect(html).toContain("Copy")
    await expectNoA11yViolations(html)
  })

  it("copies, says Copied, calls onCopy, then goes back after two seconds", async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    const onCopy = vi.fn()
    const h = mount(<CopyField label="Org ID" value="org_123" onCopy={onCopy} />)
    click(byText("Copy"))
    await act(async () => {
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith("org_123")
    expect(onCopy).toHaveBeenCalledWith("org_123")
    expect(document.body.textContent).toContain("Copied to clipboard.")
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(document.body.textContent).toContain("Copy")
    expect(document.body.textContent).not.toContain("Copied to clipboard.")
    h.cleanup()
  })

  it("says so when the clipboard refuses", async () => {
    setClipboard(() => Promise.reject(new Error("denied")))
    const h = mount(<CopyField label="Key" value="sk_x" />)
    click(byText("Copy"))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(document.body.textContent).toContain("Could not copy.")
    h.cleanup()
  })

  it("selects the value when its field gets focus", () => {
    const h = mount(<CopyField label="Key" value="sk_x" />)
    const input = document.querySelector<HTMLInputElement>("input")
    if (!input) throw new Error("no input")
    const select = vi.spyOn(input, "select")
    act(() => {
      input.focus()
    })
    expect(select).toHaveBeenCalled()
    h.cleanup()
  })
})
