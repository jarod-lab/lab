import type { Meta, StoryObj } from "@storybook/react-vite"
import ContextMenuExample from "../context-menu-example"
import { ContextMenu } from "./context-menu"

const meta = {
  title: "ui/Context Menu",
  component: ContextMenu,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ContextMenu>

export default meta

export const Examples: StoryObj = {
  render: () => <ContextMenuExample />,
}
