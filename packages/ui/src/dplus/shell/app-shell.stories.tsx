import type { Meta, StoryObj } from "@storybook/react-vite"
import { DemoShell, withDark } from "../pages/story-kit"

// The frame: sidebar, top bar (with the menu button that opens the sidebar drawer below md) and main.
const meta = {
  title: "D+/Shell/AppShell",
  parameters: { layout: "fullscreen" },
  args: { active: "agents", crumbs: [{ label: "Acme Inc" }, { label: "Agents" }] },
  render: (args) => (
    <DemoShell active={args.active} crumbs={args.crumbs}>
      <div className="flex flex-1 flex-col gap-3 px-9 py-7">
        <h1 className="type-h1">Agents</h1>
        <p className="text-muted-foreground">Page content goes here.</p>
      </div>
    </DemoShell>
  ),
} satisfies Meta<{ active: string; crumbs: { label: string }[] }>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const NoAnnouncement: Story = { args: { active: "runs" } }
export const Dark: Story = { decorators: [withDark] }
