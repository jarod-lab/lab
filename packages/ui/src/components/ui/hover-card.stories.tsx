import type { Meta, StoryObj } from "@storybook/react-vite"
import HoverCardExample from "../examples/hover-card-example"
import { HoverCard } from "./hover-card"

const meta = {
  title: "ui/Hover Card",
  component: HoverCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof HoverCard>

export default meta

export const Examples: StoryObj = {
  render: () => <HoverCardExample />,
}
