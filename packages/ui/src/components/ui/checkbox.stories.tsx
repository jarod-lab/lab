import type { Meta, StoryObj } from "@storybook/react-vite"
import CheckboxExample from "../examples/checkbox-example"
import { Checkbox } from "./checkbox"

const meta = {
  title: "ui/Checkbox",
  component: Checkbox,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Checkbox>

export default meta

export const Examples: StoryObj = {
  render: () => <CheckboxExample />,
}
