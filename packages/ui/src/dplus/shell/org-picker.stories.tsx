import type { Meta, StoryObj } from "@storybook/react-vite"
import { demoOrgs, withDark } from "../pages/story-kit"
import { OrgPicker, type OrgPickerProps } from "./org-picker"

// A tiny inline logo, so the stories need no network.
const logo =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGN4sFQNK2IYWhIA5K9qwWzi6vIAAAAASUVORK5CYII="

const meta = {
  title: "D+/Shell/OrgPicker",
  component: OrgPicker,
  parameters: { layout: "padded" },
  args: {
    orgs: demoOrgs,
    activeOrgId: "acme",
    hrefFor: (o) => `#${o.slug}`,
    settingsHref: "#org-settings",
    createHref: "#new",
    open: true,
  },
  render: (args) => (
    <div className="min-h-[460px] w-72 bg-sidebar p-3 text-sidebar-foreground">
      <OrgPicker {...args} />
    </div>
  ),
} satisfies Meta<OrgPickerProps>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {}
export const Closed: Story = { args: { open: false } }
export const SingleOrg: Story = { args: { orgs: [demoOrgs[0]!] } }
export const NoActiveOrg: Story = { args: { activeOrgId: null } }
export const NoOrgs: Story = { args: { orgs: [], activeOrgId: null } }
export const Loading: Story = {
  args: { orgs: [], activeOrgId: null, status: "loading", open: false },
}
export const Error: Story = {
  args: { orgs: [], activeOrgId: null, status: "error", onRetry: () => {} },
}
export const CapabilityRoles: Story = {
  args: {
    orgs: [
      { id: "review", name: "Review Co", slug: "review", role: "Approver" },
      { id: "ops", name: "Ops Team", slug: "ops", role: "Operator" },
      { id: "finance", name: "Finance Ltd", slug: "finance", role: "Billing" },
    ],
    activeOrgId: "review",
  },
}
export const WithLogos: Story = {
  args: {
    orgs: demoOrgs.map((o) => ({ ...o, logo })),
  },
}
export const Dark: Story = { decorators: [withDark] }
export const DarkNoActiveOrg: Story = { args: { activeOrgId: null }, decorators: [withDark] }
