import type { Meta, StoryObj } from "@storybook/react-vite"
import BreadcrumbExample from "../examples/breadcrumb-example"
import { Breadcrumb } from "./breadcrumb"

const meta = {
  title: "ui/Breadcrumb",
  component: Breadcrumb,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Breadcrumb>

export default meta

export const Examples: StoryObj = {
  render: () => <BreadcrumbExample />,
}
