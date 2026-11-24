// @vitest-environment jsdom
import { expectNoA11yViolations } from "@lab/ui/a11y"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { HqError, type HqErrorKind } from "../api/errors"
import { describeError, EmptyState, ErrorBlock, LoadingBlock, NotConnected } from "./states"

const KINDS: HqErrorKind[] = [
  "unauthorized",
  "forbidden",
  "untrusted-origin",
  "not-found",
  "conflict",
  "bad-request",
  "rate-limited",
  "refused",
  "unreachable",
  "server",
]

function error(kind: HqErrorKind, retryAfterSeconds: number | null = null) {
  return new HqError({ kind, status: 400, message: "raw server text", retryAfterSeconds })
}

describe("describeError", () => {
  it("maps every HqErrorKind to a title and body", () => {
    const seen = new Set<string>()
    for (const kind of KINDS) {
      const { title, body } = describeError(error(kind, 7))
      expect(title, kind).not.toBe("")
      expect(body, kind).not.toBe("")
      expect(`${title} ${body}`, kind).not.toContain("raw server text")
      seen.add(title)
    }
    expect(seen.size).toBe(KINDS.length)
  })

  it("untrusted-origin says to open the app on the org's canonical host", () => {
    const { body } = describeError(error("untrusted-origin"))
    expect(body).toContain("canonical host")
    expect(body).toMatch(/open the app/i)
  })

  it("refused says hq refused to start and nothing is wrong with the account", () => {
    const { title, body } = describeError(error("refused"))
    expect(`${title} ${body}`).toMatch(/refused to start/)
    expect(body).toMatch(/nothing is wrong with your account/i)
  })

  it("rate-limited names the wait time", () => {
    expect(describeError(error("rate-limited", 42)).body).toContain("42 seconds")
    expect(describeError(error("rate-limited", 1)).body).toContain("1 second.")
  })

  it("conflict says already decided", () => {
    expect(describeError(error("conflict")).title).toMatch(/already decided/i)
  })
})

describe("states", () => {
  it("ErrorBlock shows Retry only when onRetry is given", async () => {
    const onRetry = vi.fn()
    const without = render(<ErrorBlock error={error("server")} />)
    expect(without.queryByRole("button", { name: "Retry" })).toBeNull()
    expect(without.getByRole("alert").textContent).toContain(describeError(error("server")).title)
    without.unmount()
    const withRetry = render(<ErrorBlock error={error("server")} onRetry={onRetry} />)
    const button = withRetry.getByRole("button", { name: "Retry" })
    expect(button.className).toContain("min-h-touch")
    button.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("LoadingBlock is aria-busy and names what loads", () => {
    const view = render(<LoadingBlock label="proposals" />)
    const block = view.getByRole("status")
    expect(block.getAttribute("aria-busy")).toBe("true")
    expect(block.textContent).toContain("proposals")
  })

  it("EmptyState shows a title and an optional description", () => {
    const view = render(<EmptyState title="Nothing here" description="Check back later." />)
    expect(view.getByText("Nothing here")).toBeTruthy()
    expect(view.getByText("Check back later.")).toBeTruthy()
    view.rerender(<EmptyState title="Only title" />)
    expect(view.queryByText("Check back later.")).toBeNull()
  })

  it("NotConnected is a status that says 'Not connected' and names the source", () => {
    const view = render(<NotConnected source="Sentry" what="Errors" />)
    const status = view.getByRole("status")
    expect(status.textContent).toContain("Not connected")
    expect(status.textContent).toContain("Sentry")
    expect(status.textContent).toContain("Errors")
  })

  it("has no a11y violations and no inline style", async () => {
    const view = render(
      <div>
        <ErrorBlock error={error("refused")} onRetry={() => {}} />
        <LoadingBlock label="digest" />
        <EmptyState title="Empty" description="d" />
        <NotConnected source="PostHog" what="Product health" />
      </div>,
    )
    expect(view.container.querySelector("[style]")).toBeNull()
    await expectNoA11yViolations(view.container.innerHTML)
  })
})
