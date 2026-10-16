import type { Meta, StoryObj } from "@storybook/react-vite"
import InputExample from "../examples/input-example"
import { Input } from "./input"

const meta = {
  title: "ui/Input",
  component: Input,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Input>

export default meta

export const Examples: StoryObj = {
  render: () => <InputExample />,
}
