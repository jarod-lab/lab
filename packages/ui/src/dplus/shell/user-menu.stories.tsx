import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { UserMenu, type UserMenuProps } from "./user-menu"

// A tiny inline avatar, so the stories need no network.
const avatar =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGOombMfK2IYWhIA8at1wZtyGRIAAAAASUVORK5CYII="

const meta = {
  title: "D+/Shell/UserMenu",
  component: UserMenu,
  parameters: { layout: "padded" },
  args: {
    user: { name: "Jordan Lee", email: "jordan@acme.dev" },
    theme: "light",
    onThemeChange: () => {},
    personalSettingsHref: "#account-profile",
    securityHref: "#account-security",
    onShowShortcuts: () => {},
    onSignOut: () => {},
    open: true,
  },
  render: (args) => (
    <div className="flex min-h-[460px] w-72 flex-col justify-end bg-sidebar p-3 text-sidebar-foreground">
      <UserMenu {...args} />
    </div>
  ),
} satisfies Meta<UserMenuProps>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
export const Closed: Story = { args: { open: false } }
export const DarkThemeChosen: Story = { args: { theme: "dark" } }
export const NoShortcutsItem: Story = { args: { onShowShortcuts: undefined } }
export const WithAvatar: Story = {
  args: { user: { name: "Jordan Lee", email: "jordan@acme.dev", image: avatar } },
}
export const Dark: Story = { decorators: [withDark] }
export const WithAvatarDark: Story = {
  args: { user: { name: "Jordan Lee", email: "jordan@acme.dev", image: avatar } },
  decorators: [withDark],
}
