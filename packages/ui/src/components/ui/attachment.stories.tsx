import type { Meta, StoryObj } from "@storybook/react-vite"
import AttachmentExample from "../examples/attachment-example"
import { Attachment } from "./attachment"

const meta = {
  title: "ui/Attachment",
  component: Attachment,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Attachment>

export default meta

export const Examples: StoryObj = {
  render: () => <AttachmentExample />,
}
