import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { CommandPalette, type CommandPaletteProps } from "./command-palette"

const groups = [
  {
    heading: "Navigate",
    items: [
      { id: "home", label: "Home", shortcut: ["G", "H"] },
      { id: "agents", label: "Agents", shortcut: ["G", "A"] },
      { id: "approvals", label: "Approvals" },
    ],
  },
  {
    heading: "Actions",
    items: [
      { id: "new-agent", label: "Create an agent" },
      { id: "shortcuts", label: "Keyboard shortcuts", shortcut: ["?"] },
    ],
  },
  {
    heading: "Organizations",
    items: [
      { id: "org-northwind", label: "Northwind Labs" },
      { id: "org-jordan", label: "Jordan's workspace" },
    ],
  },
]

const meta = {
  title: "D+/Shell/CommandPalette",
  component: CommandPalette,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onOpenChange: () => {},
    groups,
    onSelect: () => {},
    onAskAgent: () => {},
  },
} satisfies Meta<CommandPaletteProps>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {}
export const Closed: Story = { args: { open: false } }
export const Dark: Story = { decorators: [withDark] }
