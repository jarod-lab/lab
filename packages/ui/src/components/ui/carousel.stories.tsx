import type { Meta, StoryObj } from "@storybook/react-vite"
import CarouselExample from "../carousel-example"
import { Carousel } from "./carousel"

const meta = {
  title: "ui/Carousel",
  component: Carousel,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Carousel>

export default meta

export const Examples: StoryObj = {
  render: () => <CarouselExample />,
}
