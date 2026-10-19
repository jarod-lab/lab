// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RunSummary } from "./run-summary"

describe("RunSummary", () => {
  it("highlights a fenced code block with sugar-high's token classes", () => {
    const { container } = render(<RunSummary markdown={"```ts\nconst ready = true\n```"} />)
    const block = container.querySelector("pre.run-code")
    expect(block).toBeTruthy()
    expect(block?.getAttribute("data-language")).toBe("typescript")
    expect(block?.querySelector(".sh__token--keyword")?.textContent).toBe("const")
  })

  it("escapes code so that it can't inject markup", () => {
    const { container } = render(
      <RunSummary markdown={"```html\n<img src=x onerror=alert(1)>\n```"} />,
    )
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("pre.run-code")?.textContent).toContain("<img src=x")
  })

  it("keeps inline code inline and renders links", () => {
    render(<RunSummary markdown={"Use `pnpm test` at [docs](https://example.com)."} />)
    expect(screen.getByText("pnpm test").tagName).toBe("CODE")
    expect(screen.getByRole("link", { name: "docs" }).getAttribute("href")).toBe(
      "https://example.com",
    )
  })

  it("falls back to plain text for an unknown language", () => {
    const { container } = render(<RunSummary markdown={"```nosuchlang\nhello\n```"} />)
    expect(container.querySelector("pre.run-code")?.getAttribute("data-language")).toBe("plaintext")
  })
})
