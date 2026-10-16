import type { Meta, StoryObj } from "@storybook/react-vite"
import TooltipExample from "../examples/tooltip-example"
import { Tooltip } from "./tooltip"

const meta = {
  title: "ui/Tooltip",
  component: Tooltip,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Tooltip>

export default meta

export const Examples: StoryObj = {
  render: () => <TooltipExample />,
}
