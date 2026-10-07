import type { Meta, StoryObj } from "@storybook/react-vite"
import FieldExample from "../field-example"
import { Field } from "./field"

const meta = {
  title: "ui/Field",
  component: Field,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Field>

export default meta

export const Examples: StoryObj = {
  render: () => <FieldExample />,
}
