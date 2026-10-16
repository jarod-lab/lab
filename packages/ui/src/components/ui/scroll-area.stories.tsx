import type { Meta, StoryObj } from "@storybook/react-vite"
import ScrollAreaExample from "../examples/scroll-area-example"
import { ScrollArea } from "./scroll-area"

const meta = {
  title: "ui/Scroll Area",
  component: ScrollArea,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ScrollArea>

export default meta

export const Examples: StoryObj = {
  render: () => <ScrollAreaExample />,
}
