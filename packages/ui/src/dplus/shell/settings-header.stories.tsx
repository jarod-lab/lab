import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { SettingsHeader, type SettingsHeaderProps } from "./settings-header"

const orgTabs = [
  { id: "general", label: "General", href: "#general" },
  { id: "members", label: "Members", href: "#members", count: "12" },
  { id: "api-keys", label: "API keys", href: "#api-keys" },
  { id: "billing", label: "Billing", href: "#billing" },
  { id: "agents", label: "Agents", href: "#agents" },
  { id: "integrations", label: "Integrations", href: "#integrations", badge: "1 expired" },
]

const accountTabs = [
  { id: "profile", label: "Profile & account", href: "#profile" },
  { id: "security", label: "Security", href: "#security" },
]

const meta = {
  title: "D+/Shell/SettingsHeader",
  component: SettingsHeader,
  parameters: { layout: "padded" },
  args: {
    title: "Organization settings",
    context: "Acme Inc · you are Owner",
    tabs: orgTabs,
    activeTab: "members",
  },
  render: (args) => (
    <div className="min-w-0 bg-background text-foreground">
      <SettingsHeader {...args} />
    </div>
  ),
} satisfies Meta<SettingsHeaderProps>

export default meta
type Story = StoryObj<typeof meta>

export const OrgTabs: Story = {}
export const AccountTabsWithPills: Story = {
  args: {
    title: "Personal settings",
    context: "Jordan Lee · jordan@acme.dev",
    tabs: accountTabs,
    activeTab: "profile",
    pills: [
      { id: "all", label: "All", href: "#all" },
      { id: "keys", label: "Keys", href: "#keys" },
    ],
    activePill: "all",
  },
}
export const ViewerOnly: Story = {
  args: { context: "Acme Inc · you are Viewer", viewOnly: "Acme Inc" },
}
export const Dark: Story = { decorators: [withDark] }
