import type { Meta, StoryObj } from "@storybook/react-vite"
import RadioGroupExample from "../radio-group-example"
import { RadioGroup } from "./radio-group"

const meta = {
  title: "ui/Radio Group",
  component: RadioGroup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RadioGroup>

export default meta

export const Examples: StoryObj = {
  render: () => <RadioGroupExample />,
}
