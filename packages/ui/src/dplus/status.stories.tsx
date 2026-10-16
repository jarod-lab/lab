import type { Meta, StoryObj } from "@storybook/react-vite"
import { Spinner } from "../components/ui/spinner"
import { withDark } from "./pages/story-kit"
import { VariantRow, VariantTable } from "./pages/story-kit"
import { Status, type StatusState, StatusIcon } from "./status"

const meta = {
  title: "D+/Status",
  component: Status,
  args: { state: "running" },
  argTypes: {
    state: {
      control: "inline-radio",
      options: ["running", "needs-you", "done", "queued", "failed"],
    },
  },
} satisfies Meta<typeof Status>

export default meta

export const Playground: StoryObj<typeof meta> = {}

const states: [StatusState, string][] = [
  ["running", "2 running"],
  ["needs-you", "Needs you"],
  ["done", "Collected 14 release blockers"],
  ["queued", "Idle"],
  ["failed", "Tests failed"],
]

function AllVariants() {
  return (
    <VariantTable columns={["default word", "custom word", "icon only", "large icon"]}>
      {states.map(([state, word]) => (
        <VariantRow key={state} name={state}>
          <Status state={state} />
          <Status state={state}>{word}</Status>
          <StatusIcon state={state} />
          <StatusIcon state={state} className="size-6" />
        </VariantRow>
      ))}
      <VariantRow name="Spinner">
        <Spinner />
        <span className="flex items-center gap-2 text-sm">
          <Spinner /> Loading
        </span>
        <Spinner className="size-6" />
        <Spinner className="size-8" />
      </VariantRow>
    </VariantTable>
  )
}

export const Variants: StoryObj = {
  parameters: { layout: "fullscreen" },
  render: () => <AllVariants />,
}
export const VariantsDark: StoryObj = { ...Variants, decorators: [withDark] }
