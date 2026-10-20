import type { Meta, StoryObj } from "@storybook/react-vite"
import { SidebarProvider } from "../../components/ui/sidebar"
import { demoAccount, demoNav, demoOrgs, demoPinned, withDark } from "../pages/story-kit"
import { AppSidebar, type AppSidebarProps } from "./app-sidebar"

const meta = {
  title: "D+/Shell/AppSidebar",
  component: AppSidebar,
  parameters: { layout: "fullscreen" },
  args: {
    org: {
      orgs: demoOrgs,
      activeOrgId: "acme",
      hrefFor: (o) => `#${o.slug}`,
      settingsHref: "#org-settings",
      createHref: "#new",
    },
    nav: demoNav,
    activeId: "agents",
    pinnedAgents: demoPinned,
    announcement: {
      id: "pull-requests",
      badge: "NEW",
      title: "Agents can open pull requests",
      href: "#post",
      linkLabel: "Read the post",
    },
    support: { href: "#support" },
    account: demoAccount,
  },
  render: (args) => (
    <SidebarProvider className="h-190 min-h-0 w-[600px] bg-background text-foreground">
      <AppSidebar {...args} />
    </SidebarProvider>
  ),
} satisfies Meta<AppSidebarProps>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const NoPinnedAgents: Story = { args: { pinnedAgents: [] } }
export const NoAnnouncement: Story = { args: { announcement: undefined } }
/** Someone who runs the product: the admin console link above Support. */
export const WithAdmin: Story = { args: { admin: { href: "#admin" } } }
export const AdminCurrent: Story = { args: { admin: { href: "#admin" }, activeId: "admin" } }
// A tiny inline avatar and logo, so the stories need no network.
const avatar =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOombMfK2IYWhIA8at1wZtyGRIAAAAASUVORK5CYII="
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN4sFQNK2IYWhIA5K9qwWzi6vIAAAAASUVORK5CYII="

export const WithImages: Story = {
  args: {
    org: {
      orgs: demoOrgs.map((o) => ({ ...o, logo })),
      activeOrgId: "acme",
      hrefFor: (o) => `#${o.slug}`,
      settingsHref: "#org-settings",
      createHref: "#new",
    },
    account: {
      ...demoAccount,
      user: { ...demoAccount.user, image: avatar },
    },
  },
}
export const Dark: Story = { decorators: [withDark] }
