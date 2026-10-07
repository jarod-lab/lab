import type { Meta, StoryObj } from "@storybook/react-vite"
import SliderExample from "../slider-example"
import { Slider } from "./slider"

const meta = {
  title: "ui/Slider",
  component: Slider,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Slider>

export default meta

export const Examples: StoryObj = {
  render: () => <SliderExample />,
}
