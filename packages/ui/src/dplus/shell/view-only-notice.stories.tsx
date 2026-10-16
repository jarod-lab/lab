import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { ViewOnlyNotice } from "./view-only-notice"

const meta = {
  title: "D+/Shell/ViewOnlyNotice",
  component: ViewOnlyNotice,
  parameters: { layout: "padded" },
  args: { subject: "Acme Inc" },
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ViewOnlyNotice>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const WithReason: Story = {
  args: { subject: "this agent", children: "Ask an owner or admin to change it." },
}
export const Dark: Story = { decorators: [withDark, meta.decorators[0]!] }
