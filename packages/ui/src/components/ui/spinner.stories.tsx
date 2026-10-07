import type { Meta, StoryObj } from "@storybook/react-vite"
import SpinnerExample from "../spinner-example"
import { Spinner } from "./spinner"

const meta = {
  title: "ui/Spinner",
  component: Spinner,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Spinner>

export default meta

export const Examples: StoryObj = {
  render: () => <SpinnerExample />,
}
