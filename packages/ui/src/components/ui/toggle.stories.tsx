import type { Meta, StoryObj } from "@storybook/react-vite"
import ToggleExample from "../examples/toggle-example"
import { Toggle } from "./toggle"

const meta = {
  title: "ui/Toggle",
  component: Toggle,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Toggle>

export default meta

export const Examples: StoryObj = {
  render: () => <ToggleExample />,
}
