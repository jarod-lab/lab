import type { Meta, StoryObj } from "@storybook/react-vite"
import SelectExample from "../examples/select-example"
import { Select } from "./select"

const meta = {
  title: "ui/Select",
  component: Select,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Select>

export default meta

export const Examples: StoryObj = {
  render: () => <SelectExample />,
}
