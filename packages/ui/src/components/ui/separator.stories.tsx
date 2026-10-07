import type { Meta, StoryObj } from "@storybook/react-vite"
import SeparatorExample from "../separator-example"
import { Separator } from "./separator"

const meta = {
  title: "ui/Separator",
  component: Separator,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Separator>

export default meta

export const Examples: StoryObj = {
  render: () => <SeparatorExample />,
}
