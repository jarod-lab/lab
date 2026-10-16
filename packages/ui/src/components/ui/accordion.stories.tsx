import type { Meta, StoryObj } from "@storybook/react-vite"
import AccordionExample from "../examples/accordion-example"
import { Accordion } from "./accordion"

const meta = {
  title: "ui/Accordion",
  component: Accordion,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Accordion>

export default meta

export const Examples: StoryObj = {
  render: () => <AccordionExample />,
}
