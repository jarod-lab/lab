import type { Meta, StoryObj } from "@storybook/react-vite"
import BadgeExample from "../badge-example"
import { Badge } from "./badge"

const meta = {
  title: "ui/Badge",
  component: Badge,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Badge>

export default meta

export const Examples: StoryObj = {
  render: () => <BadgeExample />,
}
