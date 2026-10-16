import type { Meta, StoryObj } from "@storybook/react-vite"
import CalendarExample from "../examples/calendar-example"
import { Calendar } from "./calendar"

const meta = {
  title: "ui/Calendar",
  component: Calendar,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Calendar>

export default meta

export const Examples: StoryObj = {
  render: () => <CalendarExample />,
}
