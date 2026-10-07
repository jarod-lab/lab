import type { Meta, StoryObj } from "@storybook/react-vite"
import SwitchExample from "../switch-example"
import { Switch } from "./switch"

const meta = {
  title: "ui/Switch",
  component: Switch,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Switch>

export default meta

export const Examples: StoryObj = {
  render: () => <SwitchExample />,
}
