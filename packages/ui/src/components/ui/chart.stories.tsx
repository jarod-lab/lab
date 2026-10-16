import type { Meta, StoryObj } from "@storybook/react-vite"
import ChartExample from "../examples/chart-example"
import { ChartContainer } from "./chart"

const meta = {
  title: "ui/Chart",
  component: ChartContainer,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ChartContainer>

export default meta

export const Examples: StoryObj = {
  render: () => <ChartExample />,
}
