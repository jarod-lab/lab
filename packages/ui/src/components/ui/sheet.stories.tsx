import type { Meta, StoryObj } from "@storybook/react-vite"
import SheetExample from "../sheet-example"
import { Sheet } from "./sheet"

const meta = {
  title: "ui/Sheet",
  component: Sheet,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Sheet>

export default meta

export const Examples: StoryObj = {
  render: () => <SheetExample />,
}
