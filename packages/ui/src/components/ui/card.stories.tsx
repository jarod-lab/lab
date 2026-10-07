import type { Meta, StoryObj } from "@storybook/react-vite"
import CardExample from "../card-example"
import { Card } from "./card"

const meta = {
  title: "ui/Card",
  component: Card,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Card>

export default meta

export const Examples: StoryObj = {
  render: () => <CardExample />,
}
