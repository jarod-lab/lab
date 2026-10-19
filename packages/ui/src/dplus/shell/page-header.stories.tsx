import type { Meta, StoryObj } from "@storybook/react-vite"
import { withDark } from "../pages/story-kit"
import { PageBody, PageHeader, type PageHeaderProps } from "./page-header"

const meta = {
  title: "D+/Shell/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  args: { title: "Overview", context: "Acme Inc · you are Owner" },
  render: (args) => (
    <div className="min-w-0 bg-background text-foreground">
      <PageHeader {...args} />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          Page content sits here, at the shared width.
        </p>
      </PageBody>
    </div>
  ),
} satisfies Meta<PageHeaderProps>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Dark: Story = { decorators: [withDark] }
