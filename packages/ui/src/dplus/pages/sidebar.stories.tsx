import type { Meta, StoryObj } from "@storybook/react-vite"
import { SidebarProvider } from "../../components/ui/sidebar"
import { AppSidebar } from "../shell/app-sidebar"
import { demoAccount, demoNav, demoOrgs, demoPinned, withDark } from "./story-kit"

// Board "Component — Sidebar": the real AppSidebar on fixture data.

type Args = {
  active: "home" | "agents" | "runs" | "approvals" | "settings"
  menu: "none" | "org" | "user"
  announce: boolean
}

const meta = {
  title: "D+/Pages/Component — Sidebar",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { active: "settings", menu: "none", announce: true },
  argTypes: {
    active: { control: "select", options: ["home", "agents", "runs", "approvals", "settings"] },
    menu: { control: "inline-radio", options: ["none", "org", "user"] },
  },
  render: ({ active, menu, announce }) => (
    <SidebarProvider className="h-190 min-h-0 w-[600px] bg-background text-foreground">
      <AppSidebar
        org={{
          orgs: demoOrgs,
          activeOrgId: "acme",
          hrefFor: (o) => `#${o.slug}`,
          settingsHref: "#org-settings",
          createHref: "#new",
          open: menu === "org",
        }}
        nav={demoNav}
        activeId={active}
        pinnedAgents={demoPinned}
        announcement={
          announce
            ? {
                id: "pull-requests",
                badge: "NEW",
                title: "Agents can open pull requests",
                href: "#post",
                linkLabel: "Read the post",
              }
            : undefined
        }
        support={{ href: "#support" }}
        account={{ ...demoAccount, open: menu === "user" }}
      />
    </SidebarProvider>
  ),
} satisfies Meta<Args>

export default meta
type Story = StoryObj<Args>

export const Default: Story = {}
export const OrgPickerOpen: Story = { args: { menu: "org" } }
export const UserMenuOpen: Story = { args: { menu: "user" } }
export const Dark: Story = { decorators: [withDark] }
export const DarkOrgPicker: Story = { args: { menu: "org" }, decorators: [withDark] }
