import type { Meta, StoryObj } from "@storybook/react-vite"
import DialogExample from "../examples/dialog-example"
import { Dialog } from "./dialog"

const meta = {
  title: "ui/Dialog",
  component: Dialog,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Dialog>

export default meta

export const Examples: StoryObj = {
  render: () => <DialogExample />,
}
