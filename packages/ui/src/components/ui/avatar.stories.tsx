import type { Meta, StoryObj } from "@storybook/react-vite"
import AvatarExample from "../avatar-example"
import { Avatar } from "./avatar"

const meta = {
  title: "ui/Avatar",
  component: Avatar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Avatar>

export default meta

export const Examples: StoryObj = {
  render: () => <AvatarExample />,
}
