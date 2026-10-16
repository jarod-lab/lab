import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { Shortcut } from "./shortcut"

const meta = {
  title: "D+/Shell/Shortcut",
  component: Shortcut,
  parameters: { layout: "padded" },
  args: { keys: ["G", "H"] },
  decorators: [
    (Story) => (
      <div className="flex w-60 items-center bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Shortcut>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Single: Story = { args: { keys: ["?"] } }
export const Chord: Story = { args: { keys: ["⌘", "K"] } }
export const Dark: Story = { decorators: [withDark, meta.decorators[0]!] }
