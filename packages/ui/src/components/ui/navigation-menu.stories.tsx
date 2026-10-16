import type { Meta, StoryObj } from "@storybook/react-vite"
import NavigationMenuExample from "../examples/navigation-menu-example"
import { NavigationMenu } from "./navigation-menu"

const meta = {
  title: "ui/Navigation Menu",
  component: NavigationMenu,
  parameters: { layout: "padded" },
} satisfies Meta<typeof NavigationMenu>

export default meta

export const Examples: StoryObj = {
  render: () => <NavigationMenuExample />,
}
