// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { type SlugStatus, SlugField } from "./slug-field"
import { mount, typeInto } from "./test-helpers"

const words: [SlugStatus, string | null][] = [
  ["idle", null],
  ["checking", "Checking"],
  ["available", "Available"],
  ["taken", "Taken"],
  ["invalid", "Use lowercase letters"],
  ["reserved", "That address is reserved"],
]

describe("SlugField", () => {
  it.each(words)("shows the %s status as shape and word", async (status, word) => {
    const html = renderToStaticMarkup(
      <SlugField
        label="URL"
        prefix="app.example.com/"
        value="acme"
        onChange={() => {}}
        status={status}
      />,
    )
    expect(html).toContain("app.example.com/")
    if (word === null) {
      expect(html).not.toContain("aria-describedby")
    } else {
      expect(html).toContain(word)
      expect(html).toContain("aria-describedby=")
    }
    await expectNoA11yViolations(html)
  })

  it("marks taken, invalid and reserved values as invalid", () => {
    expect(
      renderToStaticMarkup(
        <SlugField label="URL" prefix="x/" value="a" onChange={() => {}} status="taken" />,
      ),
    ).toContain('aria-invalid="true"')
    expect(
      renderToStaticMarkup(
        <SlugField label="URL" prefix="x/" value="admin" onChange={() => {}} status="reserved" />,
      ),
    ).toContain('aria-invalid="true"')
    expect(
      renderToStaticMarkup(
        <SlugField label="URL" prefix="x/" value="a" onChange={() => {}} status="available" />,
      ),
    ).not.toContain("aria-invalid")
  })

  it("reports typing", () => {
    const onChange = vi.fn()
    const h = mount(
      <SlugField label="URL" prefix="x/" value="" onChange={onChange} status="idle" name="slug" />,
    )
    const input = document.querySelector<HTMLInputElement>('input[name="slug"]')
    if (!input) throw new Error("no input")
    typeInto(input, "new-slug")
    expect(onChange).toHaveBeenCalledWith("new-slug")
    h.cleanup()
  })
})

describe("SlugField disabled", () => {
  it("is read-only and dashed when a viewer cannot change the address", () => {
    const html = renderToStaticMarkup(
      <SlugField
        label="URL"
        prefix="app.example.com/"
        value="acme"
        onChange={() => {}}
        status="idle"
        disabled
      />,
    )
    expect(html).toMatch(/<input[^>]*disabled/)
    expect(html).toContain("border-dashed")
  })
})
