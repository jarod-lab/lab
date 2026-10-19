// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { OrgSettingsApi } from "../lib/org-settings-api"
import { WebError } from "../lib/web-auth"
import type { RunDetail, RunsApi } from "../lib/runs-api"
import { useRunPolling } from "../lib/use-run-polling"
import { fakeAuth } from "../test/fake-auth"
import { notFresh, renderWithReauth } from "../test/reauth"
import { RunViewContainer } from "./run-view"

// The poller is wrapped, not replaced: the tests read the `live` flag the container gives it.
vi.mock("../lib/use-run-polling", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/use-run-polling")>()
  return { ...actual, useRunPolling: vi.fn(actual.useRunPolling) }
})

const acme = { id: "org-a", name: "Acme Inc", slug: "acme" }

/** The `live` flag the container last gave the poller. */
function lastLive(): boolean | undefined {
  return vi.mocked(useRunPolling).mock.calls.at(-1)?.[0].live
}

/** A local time one day ahead, in the datetime-local format the picker takes. */
function tomorrowLocal(): string {
  const later = new Date(Date.now() + 86_400_000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`
}

const ALLOWED: Record<string, string[]> = {
  owner: ["run:read", "run:approve", "run:steer"],
  member: ["run:read", "run:steer"],
  viewer: ["run:read"],
}

const settings = {
  roleAllows: vi.fn((role: string, permissions: Record<string, string[]>) => {
    const granted = ALLOWED[role] ?? []
    return Object.entries(permissions).every(([resource, actions]) =>
      actions.every((action) => granted.includes(`${resource}:${action}`)),
    )
  }),
} as unknown as Pick<OrgSettingsApi, "roleAllows">

function detail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "r1",
    agentId: "agent-1",
    title: "Release triage",
    status: "needs_you",
    summary: null,
    startedBy: null,
    createdAt: "2026-10-16T10:00:00.000Z",
    startedAt: "2026-10-16T10:00:00.000Z",
    finishedAt: null,
    deferredUntil: null,
    durationMs: 1000,
    footprint: { energyWh: 0.1, tokens: 900, toolCalls: 2, energyBudgetWh: null },
    steps: [],
    approvals: [
      {
        id: "ap1",
        stepId: null,
        action: "Post summary to #releases?",
        detail: null,
        requestedAt: "2026-10-16T10:01:00.000Z",
        status: "pending",
        decision: null,
      },
    ],
    messages: [],
    ...overrides,
  }
}

function fakeApi(overrides: Partial<RunsApi> = {}): RunsApi {
  return {
    list: vi.fn(async () => ({ runs: [], nextCursor: null })),
    get: vi.fn(async () => detail()),
    decide: vi.fn(async () => ({
      id: "ap1",
      stepId: null,
      action: "Post summary to #releases?",
      detail: null,
      requestedAt: "2026-10-16T10:01:00.000Z",
      status: "approved" as const,
      decision: null,
    })),
    undo: vi.fn(async () => {
      throw new WebError("The decision can no longer be undone.", 409)
    }),
    steer: vi.fn(async () => ({
      id: "m1",
      body: "Skip billing",
      authorId: "user-1",
      createdAt: "2026-10-16T10:02:00.000Z",
    })),
    defer: vi.fn(async () => ({
      id: "r1",
      agentId: "agent-1",
      title: "Release triage",
      status: "queued" as const,
      summary: null,
      startedBy: null,
      createdAt: "2026-10-16T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      deferredUntil: "2030-01-01T02:00:00.000Z",
      durationMs: null,
      footprint: { energyWh: 0, tokens: 0, toolCalls: 0 },
    })),
    inbox: vi.fn(async () => ({ needsYou: 1 })),
    ...overrides,
  }
}

function renderRun(api: RunsApi, { role = "owner" as string } = {}) {
  return renderWithReauth(
    <RunViewContainer
      auth={fakeAuth({ memberRole: vi.fn(async () => role) })}
      api={api}
      settings={settings}
      organization={acme}
      runId="r1"
    />,
  )
}

describe("RunViewContainer", () => {
  beforeEach(() => {
    vi.mocked(useRunPolling).mockClear()
  })

  it("keeps polling while the first answer is pending", () => {
    renderRun(fakeApi({ get: vi.fn(() => new Promise<RunDetail>(() => {})) }))
    expect(lastLive()).toBe(true)
  })

  it("stops polling a run that has finished", async () => {
    renderRun(fakeApi({ get: vi.fn(async () => detail({ status: "done", approvals: [] })) }))
    await screen.findByRole("heading", { name: "Release triage" })
    expect(lastLive()).toBe(false)
  })

  it("stops polling a run that is not found, rather than refetching it every few seconds", async () => {
    const get = vi.fn(async () => {
      throw new WebError("Run not found", 404)
    })
    renderRun(fakeApi({ get }))
    await screen.findByRole("heading", { name: "Run not found" })
    expect(lastLive()).toBe(false)
  })

  it("stops polling a run that failed to load", async () => {
    // The container retries a server error twice (about 3 seconds) before it reads as failed.
    renderRun(
      fakeApi({
        get: vi.fn(async () => {
          throw new WebError("Server is down", 500)
        }),
      }),
    )
    await screen.findByText("Could not load this run. Server is down", undefined, { timeout: 6000 })
    expect(lastLive()).toBe(false)
  }, 10_000)

  it("loads the run and approves through the decision route", async () => {
    const api = fakeApi()
    renderRun(api)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Approve" }))
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith("org-a", "ap1", "approve"))
  })

  it("asks the person to confirm it's them when a decision is refused as not fresh, then decides once", async () => {
    const api = fakeApi({
      decide: vi.fn().mockRejectedValueOnce(notFresh()).mockResolvedValueOnce(undefined),
    })
    const { reauth } = renderRun(api)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Approve" }))
    const dialog = await screen.findByRole("dialog", { name: "Confirm it's you" })
    await user.type(within(dialog).getByLabelText("Password"), "pw")
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }))
    await waitFor(() => expect(api.decide).toHaveBeenCalledTimes(2))
    expect(api.decide).toHaveBeenNthCalledWith(2, "org-a", "ap1", "approve")
    expect(reauth.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("shows a refused undo as the server's answer", async () => {
    const api = fakeApi({
      get: vi.fn(async () =>
        detail({
          approvals: [
            {
              id: "ap1",
              stepId: null,
              action: "Post summary to #releases?",
              detail: null,
              requestedAt: "2026-10-16T10:01:00.000Z",
              status: "approved",
              decision: {
                decidedBy: "user-1",
                decidedAt: new Date().toISOString(),
                effectiveAt: new Date(Date.now() + 30_000).toISOString(),
                undoableUntil: new Date(Date.now() + 30_000).toISOString(),
              },
            },
          ],
        }),
      ),
    })
    renderRun(api)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Undo" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText(/can no longer be undone/)).toBeTruthy()
  })

  it("sends a steering message and clears the box", async () => {
    const api = fakeApi()
    renderRun(api)
    const user = userEvent.setup()
    const input = await screen.findByRole("textbox", { name: "Steer this run" })
    await user.type(input, "  Skip billing  ")
    await user.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() => expect(api.steer).toHaveBeenCalledWith("org-a", "r1", "Skip billing"))
  })

  it("holds Send while a steering message is in flight, so a second click cannot resend it", async () => {
    const steer = vi.fn(() => new Promise<never>(() => {}))
    renderRun(fakeApi({ steer }))
    const user = userEvent.setup()
    await user.type(await screen.findByRole("textbox", { name: "Steer this run" }), "Skip billing")
    await user.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() => expect(steer).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true)
    await user.click(screen.getByRole("button", { name: "Send" }))
    expect(steer).toHaveBeenCalledTimes(1)
  })

  it("sends a steering message once when the form is submitted twice before the first finishes", async () => {
    const steer = vi.fn(() => new Promise<never>(() => {}))
    renderRun(fakeApi({ steer }))
    const user = userEvent.setup()
    await user.type(await screen.findByRole("textbox", { name: "Steer this run" }), "Skip billing")
    const form = screen.getByRole("form", { name: "Steer this run" })
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(steer).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(steer).toHaveBeenCalledTimes(1)
  })

  it("holds Defer run while the deferral is in flight, and defers once", async () => {
    const defer = vi.fn(() => new Promise<never>(() => {}))
    renderRun(fakeApi({ defer }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Defer" }))
    const dialog = await screen.findByRole("dialog")
    await user.type(
      dialog.querySelector('input[type="datetime-local"]') as HTMLElement,
      tomorrowLocal(),
    )
    await user.click(screen.getByRole("button", { name: "Defer run" }))
    await waitFor(() => expect(defer).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("button", { name: "Defer run" })).toHaveProperty("disabled", true)
    fireEvent.submit(dialog.querySelector("form") as HTMLFormElement)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(defer).toHaveBeenCalledTimes(1)
  })

  it("does not hold the decision controls for a steering message in flight", async () => {
    const steer = vi.fn(() => new Promise<never>(() => {}))
    renderRun(fakeApi({ steer }), { role: "owner" })
    const user = userEvent.setup()
    await user.type(await screen.findByRole("textbox", { name: "Steer this run" }), "Skip billing")
    await user.click(screen.getByRole("button", { name: "Send" }))
    await waitFor(() => expect(steer).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", false)
  })

  it("defers the run to a chosen future time", async () => {
    const api = fakeApi()
    renderRun(api)
    const user = userEvent.setup()
    await user.click(await screen.findByRole("button", { name: "Defer" }))
    const dialog = await screen.findByRole("dialog")
    const picker = dialog.querySelector('input[type="datetime-local"]') as HTMLInputElement
    const later = new Date(Date.now() + 86_400_000)
    const pad = (value: number) => String(value).padStart(2, "0")
    const local = `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T${pad(later.getHours())}:${pad(later.getMinutes())}`
    await user.type(picker, local)
    await user.click(screen.getByRole("button", { name: "Defer run" }))
    await waitFor(() => expect(api.defer).toHaveBeenCalled())
    const [, , until] = (api.defer as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [
      string,
      string,
      string,
    ]
    expect(Date.parse(until)).toBeGreaterThan(Date.now())
  })

  it("reads a run of another organization as not found, without retrying", async () => {
    const get = vi.fn(async () => {
      throw new WebError("Run not found", 404)
    })
    renderRun(fakeApi({ get }))
    expect(await screen.findByRole("heading", { name: "Run not found" })).toBeTruthy()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it("is read-only for a viewer: no decisions, and no steering", async () => {
    renderRun(fakeApi(), { role: "viewer" })
    await screen.findByRole("heading", { name: "Release triage" })
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull()
    expect(screen.getByRole("textbox", { name: "Steer this run" })).toHaveProperty("disabled", true)
  })
})
