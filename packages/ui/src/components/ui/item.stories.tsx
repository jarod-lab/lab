import type { Meta, StoryObj } from "@storybook/react-vite"
import ItemExample from "../examples/item-example"
import { Item } from "./item"

const meta = {
  title: "ui/Item",
  component: Item,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Item>

export default meta

export const Examples: StoryObj = {
  render: () => <ItemExample />,
}
