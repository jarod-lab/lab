import type { Meta, StoryObj } from "@storybook/react-vite"
import { SidebarProvider } from "../../components/ui/sidebar"
import { withDark } from "../pages/story-kit"
import { NotificationsMenu } from "./notifications-menu"
import { Topbar, type TopbarProps } from "./topbar"

const crumbs = [
  { label: "Acme Inc", href: "#acme" },
  { label: "Settings", href: "#settings" },
  { label: "Members" },
]

const meta = {
  title: "D+/Shell/Topbar",
  component: Topbar,
  parameters: { layout: "fullscreen" },
  args: { crumbs, onOpenSearch: () => {} },
  // The menu button reads the sidebar state, so every story sits in a provider.
  render: (args) => (
    <SidebarProvider className="min-h-0 bg-background text-foreground">
      <div className="w-full">
        <Topbar {...args} />
      </div>
    </SidebarProvider>
  ),
} satisfies Meta<TopbarProps>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithMenuButton: Story = { args: { showMenuButton: true } }
export const SingleCrumb: Story = { args: { crumbs: [{ label: "Organizations" }] } }
export const WithNotifications: Story = {
  args: {
    notifications: (
      <NotificationsMenu
        items={[]}
        unreadCount={2}
        tab="unread"
        onTabChange={() => {}}
        onSelect={() => {}}
        onMarkAllRead={() => {}}
        open={false}
      />
    ),
  },
}
export const Dark: Story = { decorators: [withDark] }
