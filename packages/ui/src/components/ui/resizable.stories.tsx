import type { Meta, StoryObj } from "@storybook/react-vite"
import ResizableExample from "../examples/resizable-example"
import { ResizableHandle } from "./resizable"

const meta = {
  title: "ui/Resizable",
  component: ResizableHandle,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ResizableHandle>

export default meta

export const Examples: StoryObj = {
  render: () => <ResizableExample />,
}
