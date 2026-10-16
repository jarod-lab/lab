import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { Status, type StatusState, StatusIcon } from "./status"

const states: StatusState[] = ["running", "needs-you", "done", "queued", "failed"]

describe("Status", () => {
  it.each(states)("pairs the %s mark with a word", (state) => {
    const html = renderToStaticMarkup(<Status state={state} />)
    expect(html).toContain(`data-state="${state}"`)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toMatch(/>(Running|Needs you|Done|Queued|Failed)<\/span>$/)
  })

  it("takes custom words", () => {
    expect(renderToStaticMarkup(<Status state="running">2 running</Status>)).toContain("2 running")
  })

  it("only the running mark moves, and only when motion is allowed", () => {
    for (const state of states) {
      const html = renderToStaticMarkup(<StatusIcon state={state} />)
      expect(html.includes("motion-safe:animate")).toBe(state === "running")
    }
  })

  it("gives each state its own shape", () => {
    const shapes = new Set(states.map((s) => renderToStaticMarkup(<StatusIcon state={s} />)))
    expect(shapes.size).toBe(states.length)
  })
})
