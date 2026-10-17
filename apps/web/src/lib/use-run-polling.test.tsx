// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LIVE_POLL_MS, useRunPolling } from "./use-run-polling"

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

describe("useRunPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility("visible")
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibility("visible")
  })

  it("refreshes at once, then about every 2.5 seconds, while the run is live", () => {
    const refresh = vi.fn()
    renderHook(() => useRunPolling({ live: true, refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(LIVE_POLL_MS * 2 + 600)
    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(3)
    // Pacer allows at most one refresh per window: 2.5 s of ticks never yield more than 3 in a row.
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it("does nothing when the run is not live (finished)", () => {
    const refresh = vi.fn()
    renderHook(() => useRunPolling({ live: false, refresh }))
    vi.advanceTimersByTime(20_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it("stops when the run finishes, and does not restart on its own", () => {
    const refresh = vi.fn()
    const { rerender } = renderHook(({ live }) => useRunPolling({ live, refresh }), {
      initialProps: { live: true },
    })
    vi.advanceTimersByTime(3000)
    const before = refresh.mock.calls.length
    rerender({ live: false })
    vi.advanceTimersByTime(20_000)
    expect(refresh.mock.calls.length).toBe(before)
  })

  it("pauses while the tab is hidden and resumes at once when it is shown", () => {
    const refresh = vi.fn()
    renderHook(() => useRunPolling({ live: true, refresh }))
    setVisibility("hidden")
    const paused = refresh.mock.calls.length
    vi.advanceTimersByTime(20_000)
    expect(refresh.mock.calls.length).toBe(paused)
    setVisibility("visible")
    expect(refresh.mock.calls.length).toBe(paused + 1)
  })

  it("starts hidden tabs paused, and clears its timer on unmount", () => {
    const refresh = vi.fn()
    setVisibility("hidden")
    const { unmount } = renderHook(() => useRunPolling({ live: true, refresh }))
    vi.advanceTimersByTime(10_000)
    expect(refresh).not.toHaveBeenCalled()
    setVisibility("visible")
    const count = refresh.mock.calls.length
    unmount()
    vi.advanceTimersByTime(10_000)
    setVisibility("hidden")
    expect(refresh.mock.calls.length).toBe(count)
  })
})
