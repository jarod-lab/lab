import type { Meta, StoryObj } from "@storybook/react-vite"
import EmptyExample from "../empty-example"
import { Empty } from "./empty"

const meta = {
  title: "ui/Empty",
  component: Empty,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Empty>

export default meta

export const Examples: StoryObj = {
  render: () => <EmptyExample />,
}
