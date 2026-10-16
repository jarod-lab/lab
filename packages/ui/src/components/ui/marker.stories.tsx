import type { Meta, StoryObj } from "@storybook/react-vite"
import MarkerExamples from "../examples/marker-example"
import { Marker } from "./marker"

const meta = {
  title: "ui/Marker",
  component: Marker,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Marker>

export default meta

export const Examples: StoryObj = {
  render: () => <MarkerExamples />,
}
