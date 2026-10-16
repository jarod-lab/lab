import type { Meta, StoryObj } from "@storybook/react-vite"
import NativeSelectExample from "../examples/native-select-example"
import { NativeSelect } from "./native-select"

const meta = {
  title: "ui/Native Select",
  component: NativeSelect,
  parameters: { layout: "padded" },
} satisfies Meta<typeof NativeSelect>

export default meta

export const Examples: StoryObj = {
  render: () => <NativeSelectExample />,
}
