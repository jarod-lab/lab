import type { Meta, StoryObj } from "@storybook/react-vite"
import ProgressExample from "../progress-example"
import { Progress } from "./progress"

const meta = {
  title: "ui/Progress",
  component: Progress,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Progress>

export default meta

export const Examples: StoryObj = {
  render: () => <ProgressExample />,
}
