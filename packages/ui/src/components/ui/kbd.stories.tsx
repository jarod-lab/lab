import type { Meta, StoryObj } from "@storybook/react-vite"
import KbdExample from "../examples/kbd-example"
import { Kbd } from "./kbd"

const meta = {
  title: "ui/Kbd",
  component: Kbd,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Kbd>

export default meta

export const Examples: StoryObj = {
  render: () => <KbdExample />,
}
