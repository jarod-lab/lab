// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { checkA11y, expectNoA11yViolations } from "./a11y"

describe("checkA11y", () => {
  it("passes accessible markup", async () => {
    const html = renderToStaticMarkup(
      <form>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" />
        <button type="submit">Send</button>
      </form>,
    )
    expect(await checkA11y(html)).toEqual([])
    await expect(expectNoA11yViolations(html)).resolves.toBeUndefined()
  })

  it("reports an unnamed button and an unlabelled input", async () => {
    const html = '<div><button type="button"></button><input type="text"></div>'
    const rules = (await checkA11y(html)).map((v) => v.rule)
    expect(rules).toContain("button-name")
    expect(rules).toContain("label")
  })

  it("expectNoA11yViolations throws with the rule and impact", async () => {
    await expect(expectNoA11yViolations('<img src="/a.png">')).rejects.toThrow(
      /image-alt \(critical\)/,
    )
  })

  it("does not flag page-level rules on a fragment", async () => {
    expect(await checkA11y("<p>No landmarks, no h1, no lang.</p>")).toEqual([])
  })

  it("leaves the document clean afterwards", async () => {
    await checkA11y("<p>hi</p>")
    expect(document.body.innerHTML).toBe("")
  })
})
