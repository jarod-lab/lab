import type { Meta, StoryObj } from "@storybook/react-vite"
import ToggleGroupExample from "../examples/toggle-group-example"
import { ToggleGroup } from "./toggle-group"

const meta = {
  title: "ui/Toggle Group",
  component: ToggleGroup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ToggleGroup>

export default meta

export const Examples: StoryObj = {
  render: () => <ToggleGroupExample />,
}
