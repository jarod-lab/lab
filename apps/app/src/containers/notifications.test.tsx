// @vitest-environment jsdom
import type { InboxFetchClient, InboxNotification } from "better-inbox/react"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderWithClient } from "../test/render"
import { NotificationsContainer } from "./notifications"

const organizations = [
  { id: "org-a", name: "Analytical Ltd", slug: "analytical" },
  { id: "org-b", name: "Babbage Labs", slug: "babbage" },
]

function note(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: "n1",
    userId: "user-1",
    organizationId: "org-a",
    type: "approval.requested",
    title: "Approval requested",
    body: "Digest Bot wants to send.",
    href: "/analytical/runs/run-1",
    data: null,
    read: false,
    createdAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    ...overrides,
  }
}

/** An in-memory inbox. The list honours the Unread filter the way the server does. */
function fakeInbox(notifications: InboxNotification[], unread = 0) {
  const list = vi.fn(async (input: { query: { filter?: "unread" | "all" } }) => ({
    data: {
      notifications:
        input.query.filter === "unread" ? notifications.filter((n) => !n.read) : notifications,
      hasMore: false,
    },
    error: null,
  }))
  const unreadCount = vi.fn(async () => ({ data: { count: unread }, error: null }))
  const markRead = vi.fn(async () => ({ data: {}, error: null }))
  const markAllRead = vi.fn(async () => ({ data: {}, error: null }))
  const markSeen = vi.fn(async () => ({ data: {}, error: null }))
  const client: InboxFetchClient = {
    inbox: { list, unreadCount, markRead, markAllRead, markSeen },
  }
  return { client, list, markRead, markAllRead, markSeen }
}

/**
 * jsdom has no IntersectionObserver. This one reports nothing until `show` says a row is on
 * screen, the way a row below the scroll never would.
 */
function fakeIntersectionObserver() {
  const watching = new Map<Element, (entries: Partial<IntersectionObserverEntry>[]) => void>()
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      callback: (entries: Partial<IntersectionObserverEntry>[]) => void
      constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
        this.callback = callback
      }
      observe(target: Element) {
        watching.set(target, this.callback)
      }
      unobserve(target: Element) {
        watching.delete(target)
      }
      disconnect() {
        watching.clear()
      }
    },
  )
  return {
    watching: () => [...watching.keys()],
    show(target: Element) {
      watching.get(target)?.([{ target, isIntersecting: true, intersectionRatio: 1 }])
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderBell(overrides: Partial<Parameters<typeof NotificationsContainer>[0]> = {}) {
  const onNavigate = vi.fn()
  const fake = fakeInbox(
    [
      note(),
      note({
        id: "n2",
        organizationId: "org-b",
        title: "Run finished",
        body: null,
        href: "/babbage/runs/run-2",
        read: false,
      }),
      note({
        id: "n3",
        organizationId: null,
        title: "Your password was changed",
        body: null,
        href: null,
        read: true,
      }),
      note({ id: "n4", organizationId: "org-gone", title: "From a left org", read: true }),
    ],
    2,
  )
  renderWithClient(
    <NotificationsContainer
      client={fake.client}
      organizations={organizations}
      onNavigate={onNavigate}
      {...overrides}
    />,
  )
  return { ...fake, onNavigate }
}

const bell = () => screen.findByRole("button", { name: "Notifications, 2 unread" })

describe("NotificationsContainer", () => {
  it("badges the bell with the unread count and opens on the Unread tab", async () => {
    const { list } = renderBell()
    await bell()
    await userEvent.click(await bell())
    expect(await screen.findByRole("list", { name: "Notifications list" })).toBeTruthy()
    expect(screen.getByText("Approval requested")).toBeTruthy()
    expect(screen.getByText("Run finished")).toBeTruthy()
    expect(screen.queryByText("Your password was changed")).toBeNull()
    expect(list).toHaveBeenCalledWith({ query: expect.objectContaining({ filter: "unread" }) })
  })

  it("labels each row with its organization, and leaves out personal or unknown ones", async () => {
    renderBell()
    await userEvent.click(await bell())
    await userEvent.click(screen.getByRole("tab", { name: "All" }))
    const list = await screen.findByRole("list", { name: "Notifications list" })
    expect(within(list).getByText("Analytical Ltd")).toBeTruthy()
    expect(within(list).getByText("Babbage Labs")).toBeTruthy()
    expect(within(list).getByText("Your password was changed")).toBeTruthy()
    expect(within(list).getAllByRole("listitem")).toHaveLength(4)
    expect(within(list).queryByText("From a left org")?.closest("li")?.textContent).not.toContain(
      "·",
    )
  })

  it("marks a row read and follows its link", async () => {
    const { markRead, onNavigate } = renderBell()
    await userEvent.click(await bell())
    await userEvent.click(await screen.findByRole("button", { name: /Approval requested/ }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/analytical/runs/run-1"))
    expect(markRead).toHaveBeenCalledWith({ id: "n1" })
  })

  it("marks an unread row seen once it has been on screen, not when it is only rendered", async () => {
    const io = fakeIntersectionObserver()
    const { list, markSeen } = renderBell()
    await bell()
    await waitFor(() => expect(list).toHaveBeenCalled())
    await userEvent.click(await bell())
    const rows = within(await screen.findByRole("list", { name: "Notifications list" }))
    const first = rows.getByText("Approval requested").closest("li") as Element
    const second = rows.getByText("Run finished").closest("li") as Element
    expect(io.watching()).toEqual([first, second])
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(markSeen).not.toHaveBeenCalled()

    // only the first row is in view; the second is below the scroll
    io.show(first)
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith({ ids: ["n1"] }), { timeout: 2000 })
    expect(markSeen).toHaveBeenCalledTimes(1)
  })

  it("marks nothing seen for a read-only (impersonated) session", async () => {
    const io = fakeIntersectionObserver()
    const { markSeen } = renderBell({ readOnly: true })
    await userEvent.click(await bell())
    await screen.findByRole("list", { name: "Notifications list" })
    expect(io.watching()).toEqual([])
    expect(markSeen).not.toHaveBeenCalled()
  })

  it("navigates without marking read when the session is read-only (impersonation)", async () => {
    const { markRead, markAllRead, onNavigate } = renderBell({ readOnly: true })
    await userEvent.click(await bell())
    await userEvent.click(await screen.findByRole("button", { name: /Run finished/ }))
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/babbage/runs/run-2"))
    expect(markRead).not.toHaveBeenCalled()
    await userEvent.click(await bell())
    expect(screen.queryByRole("button", { name: "Mark all read" })).toBeNull()
    expect(markAllRead).not.toHaveBeenCalled()
  })

  it("marks everything read from Mark all read", async () => {
    const { markAllRead } = renderBell()
    await userEvent.click(await bell())
    await userEvent.click(await screen.findByRole("button", { name: "Mark all read" }))
    expect(markAllRead).toHaveBeenCalledWith({})
  })

  it("shows the error state when the list cannot be loaded", async () => {
    const fake = fakeInbox([])
    const failing: InboxFetchClient = {
      inbox: {
        ...fake.client.inbox,
        list: vi.fn(async () => ({ data: null, error: { status: 500 } })),
      },
    }
    renderWithClient(
      <NotificationsContainer
        client={failing}
        organizations={organizations}
        onNavigate={vi.fn()}
      />,
    )
    await userEvent.click(
      await screen.findByRole("button", { name: "Notifications, nothing unread" }),
    )
    expect(await screen.findByRole("alert")).toBeTruthy()
  })
})
