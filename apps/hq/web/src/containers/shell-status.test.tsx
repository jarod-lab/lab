// @vitest-environment jsdom
import { act } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createQueryClient } from "../api/query-client"
import { hqKeys } from "../api/query-keys"
import { createFakeHq, urlOf } from "../test/fake-hq"
import { factoryStatusFixture, proposalFixture } from "../test/fixtures"
import { renderApp } from "../test/render"

const statusCalls = (hq: ReturnType<typeof createFakeHq>) =>
  hq.sent.filter((s) => s.path === "/v1/factory/status")

describe("ShellStatus: the live sidebar", () => {
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
  })

  it("the sidebar badge shows the pending count from get_factory_status and drops to none at 0", async () => {
    const hq = createFakeHq({ factoryStatus: factoryStatusFixture({ pendingProposals: 3 }) })
    const app = await renderApp({ path: "/app/digest", hq })
    const link = await app.findByRole("link", { name: /Approvals/ })
    expect(await app.findByText("3")).toBeTruthy()
    expect(link.textContent).toContain("3")

    hq.state.factoryStatus = factoryStatusFixture({ pendingProposals: 0 })
    await act(() => app.queryClient.invalidateQueries({ queryKey: hqKeys.factoryStatus() }))
    await vi.waitFor(() => {
      expect(app.getByRole("link", { name: /Approvals/ }).textContent).toBe("Approvals")
    })
  })

  it("approving a proposal elsewhere refreshes the badge on invalidate", async () => {
    const hq = createFakeHq({
      proposals: [proposalFixture({ id: "proposal-1" })],
      factoryStatus: factoryStatusFixture({ pendingProposals: 1 }),
    })
    const app = await renderApp({ path: "/app/digest", hq })
    await app.findByText("1")
    // The decision goes through the app's own client, as the Approvals screen will send it.
    await app.router.options.context.client.decideProposal({
      proposalId: "proposal-1",
      decision: "approve",
    })
    // Not refreshed until something invalidates it.
    expect(app.getByRole("link", { name: /Approvals/ }).textContent).toContain("1")
    await act(() => app.queryClient.invalidateQueries({ queryKey: hqKeys.factoryStatus() }))
    await vi.waitFor(() => {
      expect(app.getByRole("link", { name: /Approvals/ }).textContent).toBe("Approvals")
    })
  })

  it("a failed status call leaves the nav usable and the runner card in its error state", async () => {
    const hq = createFakeHq()
    const real = hq.fetch
    hq.fetch = (input, init) =>
      urlOf(input).endsWith("/v1/factory/status")
        ? Promise.resolve(
            new Response('{"error":{"code":"INTERNAL","message":"boom"}}', {
              status: 500,
              headers: { "content-type": "application/json" },
            }),
          )
        : real(input, init)
    const queryClient = createQueryClient()
    queryClient.setDefaultOptions({ queries: { retry: false } })
    const app = await renderApp({ path: "/app/digest", hq, queryClient })
    expect(await app.findByText("Runner status unavailable")).toBeTruthy()
    expect(app.getByRole("navigation", { name: "Primary" })).toBeTruthy()
    await app.user.click(app.getByRole("link", { name: /Approvals/ }))
    expect(await app.findByRole("heading", { name: "Approvals" })).toBeTruthy()
    expect(app.router.history.location.pathname).toBe("/app/approvals")
  })

  it("polls every 30 s while the tab is visible and not while it is hidden", async () => {
    // Only the interval is faked: the query's refetch interval is a setInterval.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
    const hq = createFakeHq()
    await renderApp({ path: "/app/digest", hq })
    await vi.waitFor(() => expect(statusCalls(hq)).toHaveLength(1))

    await act(() => vi.advanceTimersByTimeAsync(29_000))
    expect(statusCalls(hq)).toHaveLength(1)
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    await vi.waitFor(() => expect(statusCalls(hq)).toHaveLength(2))

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
    await act(() => vi.advanceTimersByTimeAsync(90_000))
    expect(statusCalls(hq)).toHaveLength(2)

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
    await act(() => vi.advanceTimersByTimeAsync(30_000))
    await vi.waitFor(() => expect(statusCalls(hq)).toHaveLength(3))
  })
})
