import type { Meta, StoryObj } from "@storybook/react-vite"
import InputGroupExample from "../examples/input-group-example"
import { InputGroup } from "./input-group"

const meta = {
  title: "ui/Input Group",
  component: InputGroup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof InputGroup>

export default meta

export const Examples: StoryObj = {
  render: () => <InputGroupExample />,
}
