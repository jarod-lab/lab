import type { Meta, StoryObj } from "@storybook/react-vite"
import BubbleExample from "../bubble-example"
import { Bubble } from "./bubble"

const meta = {
  title: "ui/Bubble",
  component: Bubble,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Bubble>

export default meta

export const Examples: StoryObj = {
  render: () => <BubbleExample />,
}
