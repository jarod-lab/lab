// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import type { RunsApi } from "../lib/runs-api"
import { useInboxCount, useRunningCount } from "./inbox"

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function api(overrides: Partial<RunsApi> = {}): RunsApi {
  return {
    list: vi.fn(async () => ({ runs: [], nextCursor: null })),
    get: vi.fn(),
    decide: vi.fn(),
    undo: vi.fn(),
    steer: vi.fn(),
    defer: vi.fn(),
    inbox: vi.fn(async () => ({ needsYou: 0 })),
    ...overrides,
  } as unknown as RunsApi
}

describe("useRunningCount", () => {
  it("counts the running runs of this organization", async () => {
    const runs = api({
      list: vi.fn(async () => ({
        runs: [{ id: "a" }, { id: "b" }] as never,
        nextCursor: null,
      })),
    })
    const { result } = renderHook(
      () => useRunningCount({ api: runs, organizationId: "org-a", ready: true }),
      { wrapper },
    )
    await waitFor(() => expect(result.current).toEqual({ running: 2, more: false }))
    expect(runs.list).toHaveBeenCalledWith("org-a", { status: "running", limit: 100 })
  })

  it("says there are more when a further page exists, and waits while not ready", async () => {
    const runs = api({
      list: vi.fn(async () => ({ runs: [{ id: "a" }] as never, nextCursor: "next" })),
    })
    const { result, rerender } = renderHook(
      ({ ready }) => useRunningCount({ api: runs, organizationId: "org-a", ready }),
      { wrapper, initialProps: { ready: false } },
    )
    expect(result.current).toEqual({ running: 0, more: false })
    expect(runs.list).not.toHaveBeenCalled()
    rerender({ ready: true })
    await waitFor(() => expect(result.current).toEqual({ running: 1, more: true }))
  })
})

describe("useInboxCount", () => {
  it("reads needs-you from get_inbox", async () => {
    const runs = api({ inbox: vi.fn(async () => ({ needsYou: 3 })) })
    const { result } = renderHook(
      () => useInboxCount({ api: runs, organizationId: "org-a", ready: true }),
      { wrapper },
    )
    await waitFor(() => expect(result.current).toBe(3))
  })
})
