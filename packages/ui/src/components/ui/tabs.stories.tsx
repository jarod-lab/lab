import type { Meta, StoryObj } from "@storybook/react-vite"
import TabsExample from "../tabs-example"
import { Tabs } from "./tabs"

const meta = {
  title: "ui/Tabs",
  component: Tabs,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Tabs>

export default meta

export const Examples: StoryObj = {
  render: () => <TabsExample />,
}
