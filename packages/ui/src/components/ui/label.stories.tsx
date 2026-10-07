import type { Meta, StoryObj } from "@storybook/react-vite"
import LabelExample from "../label-example"
import { Label } from "./label"

const meta = {
  title: "ui/Label",
  component: Label,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Label>

export default meta

export const Examples: StoryObj = {
  render: () => <LabelExample />,
}
