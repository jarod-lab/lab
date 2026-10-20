// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { expectNoA11yViolations } from "../../a11y"
import { byText, click, mount } from "./test-helpers"
import {
  type NotificationItem,
  NotificationsMenu,
  type NotificationsMenuProps,
  notificationsLabel,
  relativeTime,
} from "./notifications-menu"

const now = new Date("2026-10-18T12:00:00Z")
const ago = (ms: number) => new Date(now.getTime() - ms)

const items: NotificationItem[] = [
  {
    id: "a",
    title: "Approval requested",
    body: "Digest Bot wants to send.",
    createdAt: ago(4 * 60_000),
    read: false,
    organizationName: "Analytical Ltd",
  },
  {
    id: "b",
    title: "Password changed",
    createdAt: ago(3 * 3_600_000),
    read: true,
  },
]

const base: NotificationsMenuProps = {
  items,
  unreadCount: 1,
  tab: "all",
  onTabChange: () => {},
  onSelect: () => {},
  onMarkAllRead: () => {},
  onLoadMore: () => {},
  hasMore: true,
  now,
  open: true,
}

describe("relativeTime", () => {
  it("steps from seconds to days, then a date", () => {
    expect(relativeTime(ago(5_000), now)).toBe("just now")
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5m ago")
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3h ago")
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2d ago")
    expect(relativeTime(new Date(now.getTime() - 30 * 86_400_000).toISOString(), now)).toMatch(/\d/)
  })

  it("never reads a future time as negative", () => {
    expect(relativeTime(new Date(now.getTime() + 60_000), now)).toBe("just now")
  })
})

describe("notificationsLabel", () => {
  it("names the unread count, or says nothing is unread", () => {
    expect(notificationsLabel(3)).toBe("Notifications, 3 unread")
    expect(notificationsLabel(0)).toBe("Notifications, nothing unread")
  })
})

describe("NotificationsMenu", () => {
  it("labels the bell with the unread count and badges it, capped at 99+", async () => {
    const html = renderToStaticMarkup(<NotificationsMenu {...base} unreadCount={3} />)
    expect(html).toContain('aria-label="Notifications, 3 unread"')
    expect(html).toContain(">3<")
    await expectNoA11yViolations(html)
    expect(renderToStaticMarkup(<NotificationsMenu {...base} unreadCount={150} />)).toContain("99+")
    expect(renderToStaticMarkup(<NotificationsMenu {...base} unreadCount={0} />)).not.toContain(
      "group/badge",
    )
  })

  it("lists the items with their organization, unread marker and time", async () => {
    const h = mount(<NotificationsMenu {...base} />)
    expect(byText("Approval requested")).toBeTruthy()
    expect(byText("Analytical Ltd")).toBeTruthy()
    expect(byText("4m ago")).toBeTruthy()
    expect(document.querySelector(".sr-only")?.textContent).toBe("Unread: ")
    const snapshot = document.body.innerHTML
    h.cleanup()
    await expectNoA11yViolations(snapshot)
  })

  it("passes the chosen row, the tab, mark-all and load-more to their callbacks", () => {
    const onSelect = vi.fn()
    const onTabChange = vi.fn()
    const onMarkAllRead = vi.fn()
    const onLoadMore = vi.fn()
    const h = mount(
      <NotificationsMenu
        {...base}
        onSelect={onSelect}
        onTabChange={onTabChange}
        onMarkAllRead={onMarkAllRead}
        onLoadMore={onLoadMore}
      />,
    )
    click(byText("Password changed"))
    expect(onSelect).toHaveBeenCalledWith(items[1])
    click(byText("Mark all read"))
    expect(onMarkAllRead).toHaveBeenCalledOnce()
    click(byText("Load more"))
    expect(onLoadMore).toHaveBeenCalledOnce()
    h.cleanup()
  })

  it("hands each row's element to rowRef, so the container can watch it come on screen", () => {
    const attached = new Map<string, HTMLLIElement>()
    const h = mount(
      <NotificationsMenu
        {...base}
        rowRef={(item) =>
          item.read
            ? undefined
            : (element) => {
                if (element) attached.set(item.id, element)
              }
        }
      />,
    )
    expect([...attached.keys()]).toEqual(["a"])
    expect(attached.get("a")).toBe(byText("Approval requested").closest("li"))
    h.cleanup()
  })

  it("hides mark-all for a read-only session and disables it with nothing unread", () => {
    const h = mount(<NotificationsMenu {...base} canMarkAllRead={false} />)
    expect(document.body.textContent).not.toContain("Mark all read")
    h.cleanup()
    const g = mount(<NotificationsMenu {...base} unreadCount={0} />)
    expect(byText("Mark all read").closest("button")?.disabled).toBe(true)
    g.cleanup()
  })

  it("shows the empty, loading and failed states", () => {
    const empty = mount(<NotificationsMenu {...base} items={[]} tab="unread" hasMore={false} />)
    expect(byText("You're all caught up")).toBeTruthy()
    empty.cleanup()
    const loading = mount(<NotificationsMenu {...base} items={[]} loading hasMore={false} />)
    expect(byText("Loading notifications…")).toBeTruthy()
    loading.cleanup()
    const failed = mount(<NotificationsMenu {...base} items={[]} failed hasMore={false} />)
    expect(document.querySelector('[role="alert"]')).toBeTruthy()
    failed.cleanup()
  })
})
