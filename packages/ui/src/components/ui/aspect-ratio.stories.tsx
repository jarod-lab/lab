import type { Meta, StoryObj } from "@storybook/react-vite"
import AspectRatioExample from "../aspect-ratio-example"
import { AspectRatio } from "./aspect-ratio"

const meta = {
  title: "ui/Aspect Ratio",
  component: AspectRatio,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AspectRatio>

export default meta

export const Examples: StoryObj = {
  render: () => <AspectRatioExample />,
}
