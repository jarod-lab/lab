import type { Meta, StoryObj } from "@storybook/react-vite"
import ButtonGroupExample from "../button-group-example"
import { ButtonGroup } from "./button-group"

const meta = {
  title: "ui/Button Group",
  component: ButtonGroup,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ButtonGroup>

export default meta

export const Examples: StoryObj = {
  render: () => <ButtonGroupExample />,
}
