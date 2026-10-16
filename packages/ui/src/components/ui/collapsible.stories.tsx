import type { Meta, StoryObj } from "@storybook/react-vite"
import CollapsibleExample from "../examples/collapsible-example"
import { Collapsible } from "./collapsible"

const meta = {
  title: "ui/Collapsible",
  component: Collapsible,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Collapsible>

export default meta

export const Examples: StoryObj = {
  render: () => <CollapsibleExample />,
}
