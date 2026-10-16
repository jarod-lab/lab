import type { Meta, StoryObj } from "@storybook/react-vite"
import TableExample from "../examples/table-example"
import { Table } from "./table"

const meta = {
  title: "ui/Table",
  component: Table,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Table>

export default meta

export const Examples: StoryObj = {
  render: () => <TableExample />,
}
