import type { Meta, StoryObj } from "@storybook/react-vite"
import MenubarExample from "../menubar-example"
import { Menubar } from "./menubar"

const meta = {
  title: "ui/Menubar",
  component: Menubar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Menubar>

export default meta

export const Examples: StoryObj = {
  render: () => <MenubarExample />,
}
