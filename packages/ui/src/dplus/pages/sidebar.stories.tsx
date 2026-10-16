import type { Meta, StoryObj } from "@storybook/react-vite"
import { SidebarProvider } from "../../components/ui/sidebar"
import { AppSidebar, type SidebarMenuState, withDark } from "./app-shell"

// Board "Component — Sidebar": the org picker, workspace nav with keycaps and live status, pinned
// agents, one dismissible announcement, Support and the account menu.

type Args = {
  active: "home" | "agents" | "runs" | "approvals" | "settings" | "new"
  menu: SidebarMenuState
  announce: boolean
}

const meta = {
  title: "D+/Pages/Component — Sidebar",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { active: "settings", menu: "none", announce: true },
  argTypes: {
    active: {
      control: "select",
      options: ["home", "agents", "runs", "approvals", "settings", "new"],
    },
    menu: { control: "inline-radio", options: ["none", "org", "user"] },
  },
  render: ({ active, menu, announce }) => (
    <SidebarProvider className="h-190 min-h-0 w-[600px] bg-background text-foreground">
      <AppSidebar active={active} menu={menu} announce={announce} />
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
