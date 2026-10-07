import type { Meta, StoryObj } from "@storybook/react-vite"
import CommandExample from "../command-example"
import { Command } from "./command"

const meta = {
  title: "ui/Command",
  component: Command,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Command>

export default meta

export const Examples: StoryObj = {
  render: () => <CommandExample />,
}
