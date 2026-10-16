import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { CopyField } from "./copy-field"

const meta = {
  title: "D+/Shell/CopyField",
  component: CopyField,
  parameters: { layout: "padded" },
  args: { label: "Organization ID", value: "org_2Kq8vX4mT9" },
  decorators: [
    (Story) => (
      <div className="max-w-md bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CopyField>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const ApiKey: Story = {
  args: { label: "API key", value: "sk_••••••••3f9a" },
}
export const Dark: Story = { decorators: [withDark, meta.decorators[0]!] }
