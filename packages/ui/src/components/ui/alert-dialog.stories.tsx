import type { Meta, StoryObj } from "@storybook/react-vite"
import AlertDialogExample from "../alert-dialog-example"
import { AlertDialog } from "./alert-dialog"

const meta = {
  title: "ui/Alert Dialog",
  component: AlertDialog,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AlertDialog>

export default meta

export const Examples: StoryObj = {
  render: () => <AlertDialogExample />,
}
