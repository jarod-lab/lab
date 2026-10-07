import type { Meta, StoryObj } from "@storybook/react-vite"
import TextareaExample from "../textarea-example"
import { Textarea } from "./textarea"

const meta = {
  title: "ui/Textarea",
  component: Textarea,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Textarea>

export default meta

export const Examples: StoryObj = {
  render: () => <TextareaExample />,
}
