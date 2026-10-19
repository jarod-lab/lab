import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import {
  type NotificationItem,
  NotificationsMenu,
  type NotificationsMenuProps,
} from "./notifications-menu"

const now = new Date("2026-10-18T12:00:00Z")
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

const items: NotificationItem[] = [
  {
    id: "1",
    title: "Approval requested for “Send weekly digest”",
    body: "Digest Bot wants to email 1,204 subscribers.",
    createdAt: minutesAgo(4),
    read: false,
    organizationName: "Analytical Ltd",
  },
  {
    id: "2",
    title: "Run finished: Invoice reconciliation",
    createdAt: minutesAgo(95),
    read: false,
    organizationName: "Babbage Labs",
  },
  {
    id: "3",
    title: "Your password was changed",
    body: "If this wasn't you, reset it now.",
    createdAt: minutesAgo(60 * 30),
    read: true,
  },
]

const meta = {
  title: "D+/Shell/NotificationsMenu",
  component: NotificationsMenu,
  parameters: { layout: "padded" },
  args: {
    items,
    unreadCount: 2,
    tab: "all",
    onTabChange: () => {},
    onSelect: () => {},
    onMarkAllRead: () => {},
    onLoadMore: () => {},
    hasMore: true,
    now,
    open: true,
  },
  render: (args) => (
    <div className="flex min-h-[520px] justify-end bg-background p-4 text-foreground">
      <NotificationsMenu {...args} />
    </div>
  ),
} satisfies Meta<NotificationsMenuProps>

export default meta
type Story = StoryObj<typeof meta>

export const All: Story = {}
export const UnreadTab: Story = { args: { tab: "unread", items: items.filter((i) => !i.read) } }
export const Empty: Story = { args: { items: [], unreadCount: 0, tab: "unread", hasMore: false } }
export const Closed: Story = { args: { open: false, unreadCount: 12 } }
export const Loading: Story = { args: { items: [], loading: true, hasMore: false } }
export const Failed: Story = { args: { items: [], failed: true, hasMore: false } }
export const ImpersonatedReadOnly: Story = { args: { canMarkAllRead: false } }
export const Dark: Story = { decorators: [withDark] }
