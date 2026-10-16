import type { Meta, StoryObj } from "@storybook/react-vite"
import SonnerExample from "../examples/sonner-example"
import { Toaster } from "./sonner"

const meta = {
  title: "ui/Sonner",
  component: Toaster,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Toaster>

export default meta

export const Examples: StoryObj = {
  render: () => <SonnerExample />,
}
