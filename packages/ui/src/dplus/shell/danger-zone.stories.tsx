import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { DangerAction, DangerZone } from "./danger-zone"

const meta = {
  title: "D+/Shell/DangerZone",
  component: DangerZone,
  parameters: { layout: "padded" },
  args: { children: null },
  decorators: [
    (Story) => (
      <div className="max-w-2xl bg-background p-6 text-foreground">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <DangerZone>
      <DangerAction
        label="Delete organization"
        consequence="Deletes Acme Inc, its 4 agents, 3 API keys and all run history. Cancels the subscription. This cannot be undone."
        onAction={() => {}}
      />
    </DangerZone>
  ),
} satisfies Meta<typeof DangerZone>

export default meta
type Story = StoryObj<typeof meta>

export const Owner: Story = {}
export const Viewer: Story = {
  render: () => (
    <DangerZone>
      <DangerAction
        label="Leave organization"
        consequence="You lose access to Acme Inc right away. An admin can invite you again."
        onAction={() => {}}
        disabled
        disabledReason="Owners cannot leave while they are the only owner."
      />
    </DangerZone>
  ),
}
export const Dark: Story = { decorators: [withDark, meta.decorators[0]!] }
