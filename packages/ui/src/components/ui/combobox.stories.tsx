import type { Meta, StoryObj } from "@storybook/react-vite"
import ComboboxExample from "../examples/combobox-example"
import { Combobox } from "./combobox"

const meta = {
  title: "ui/Combobox",
  component: Combobox,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Combobox>

export default meta

export const Examples: StoryObj = {
  render: () => <ComboboxExample />,
}
