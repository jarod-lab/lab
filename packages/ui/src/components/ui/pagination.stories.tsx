import type { Meta, StoryObj } from "@storybook/react-vite"
import PaginationExample from "../examples/pagination-example"
import { Pagination } from "./pagination"

const meta = {
  title: "ui/Pagination",
  component: Pagination,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Pagination>

export default meta

export const Examples: StoryObj = {
  render: () => <PaginationExample />,
}
