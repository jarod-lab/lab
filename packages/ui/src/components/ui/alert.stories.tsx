import type { Meta, StoryObj } from "@storybook/react-vite"
import AlertExample from "../alert-example"
import { Alert } from "./alert"

const meta = {
  title: "ui/Alert",
  component: Alert,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Alert>

export default meta

export const Examples: StoryObj = {
  render: () => <AlertExample />,
}
