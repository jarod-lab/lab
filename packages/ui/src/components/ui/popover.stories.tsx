import type { Meta, StoryObj } from "@storybook/react-vite"
import PopoverExample from "../popover-example"
import { Popover } from "./popover"

const meta = {
  title: "ui/Popover",
  component: Popover,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Popover>

export default meta

export const Examples: StoryObj = {
  render: () => <PopoverExample />,
}
