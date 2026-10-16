import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { SlugField } from "./slug-field"

const meta = {
  title: "D+/Shell/SlugField",
  component: SlugField,
  parameters: { layout: "padded" },
  args: {
    label: "URL",
    prefix: "app.example.com/",
    value: "acme-labs",
    onChange: (_value: string) => {},
    status: "available",
  },
  decorators: [
    (Story) => (
      <div className="max-w-md bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SlugField>

export default meta
type Story = StoryObj<typeof meta>

export const Available: Story = {}
export const Checking: Story = { args: { status: "checking" } }
export const Taken: Story = { args: { value: "acme", status: "taken" } }
export const Invalid: Story = { args: { value: "Acme Labs!", status: "invalid" } }
export const Idle: Story = { args: { status: "idle" } }
export const Dark: Story = {
  args: { status: "taken", value: "acme" },
  decorators: [
    withDark,
    (Story) => (
      <div className="max-w-md bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
}
