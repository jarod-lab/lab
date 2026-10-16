import type { Meta, StoryObj } from "@storybook/react-vite"
import { Meter } from "../../dplus/meter"
import { Status } from "../../dplus/status"
import { VariantRow, VariantTable } from "../../dplus/pages/story-kit"
import { withDark } from "../../dplus/pages/app-shell"
import ProgressExample from "../examples/progress-example"
import { Progress, ProgressLabel, ProgressValue } from "./progress"

const meta = {
  title: "ui/Progress",
  component: Progress,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Progress>

export default meta

export const Examples: StoryObj = {
  render: () => <ProgressExample />,
}

// Ink fill over the hatch ("not done yet") at each stage, labelled, inside a run step, and the
// cell meters for whole-number quotas.
function AllVariants() {
  return (
    <VariantTable columns={["Progress", ""]}>
      {[0, 38, 62, 100].map((v) => (
        <VariantRow key={v} name={`value ${v}`}>
          <Progress value={v} aria-label={`${v}% done`} className="w-130" />
          <span />
        </VariantRow>
      ))}
      <VariantRow name="with label">
        <Progress value={62} className="w-130">
          <ProgressLabel>Running tests</ProgressLabel>
          <ProgressValue />
        </Progress>
        <span />
      </VariantRow>
      <VariantRow name="in a run step">
        <div className="flex w-130 flex-col gap-2">
          <span className="flex gap-3">
            <Status state="running" className="flex-1 text-base font-semibold">
              Running tests
            </Status>
            <span className="text-[13px]">38 of 61</span>
          </span>
          <Progress value={62} aria-label="Tests run" className="ml-7.5" />
        </div>
        <span />
      </VariantRow>
      <VariantRow name='Meter "tall"'>
        <Meter value={12} max={15} cell="tall" label="12 of 15 seats used" />
        <span className="text-sm text-muted-foreground">12 of 15 seats used</span>
      </VariantRow>
      <VariantRow name='Meter "square"'>
        <Meter value={3} max={10} label="0.6 of 2 Wh run budget" />
        <span className="text-sm text-muted-foreground">0.6 of 2 Wh run budget</span>
      </VariantRow>
      <VariantRow name="Meter empty">
        <Meter value={0} max={10} label="Nothing used" />
        <span />
      </VariantRow>
      <VariantRow name="Meter full">
        <Meter value={10} max={10} label="Budget used up" />
        <span />
      </VariantRow>
    </VariantTable>
  )
}

export const Variants: StoryObj = {
  parameters: { layout: "fullscreen" },
  render: () => <AllVariants />,
}
export const VariantsDark: StoryObj = { ...Variants, decorators: [withDark] }
