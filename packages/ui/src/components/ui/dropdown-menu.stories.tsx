import type { Meta, StoryObj } from "@storybook/react-vite"
import DropdownMenuExample from "../dropdown-menu-example"
import { DropdownMenu } from "./dropdown-menu"

const meta = {
  title: "ui/Dropdown Menu",
  component: DropdownMenu,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DropdownMenu>

export default meta

export const Examples: StoryObj = {
  render: () => <DropdownMenuExample />,
}
