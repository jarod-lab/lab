import type { Meta, StoryObj } from "@storybook/react-vite"
import SidebarExample from "../sidebar-example"
import { Sidebar } from "./sidebar"

const meta = {
  title: "ui/Sidebar",
  component: Sidebar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Sidebar>

export default meta

export const Examples: StoryObj = {
  render: () => <SidebarExample />,
}
