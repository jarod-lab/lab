import type { Meta, StoryObj } from "@storybook/react-vite"
import DrawerExample from "../examples/drawer-example"
import { Drawer } from "./drawer"

const meta = {
  title: "ui/Drawer",
  component: Drawer,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Drawer>

export default meta

export const Examples: StoryObj = {
  render: () => <DrawerExample />,
}
