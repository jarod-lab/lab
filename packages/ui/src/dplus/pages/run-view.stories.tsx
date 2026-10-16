import type { Meta, StoryObj } from "@storybook/react-vite"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Progress } from "../../components/ui/progress"
import { Meter } from "../meter"
import { Status, type StatusState } from "../status"
import { DemoShell, withDark } from "./story-kit"

// Board "App shell — run view" from the D+ design canvas, built from the real components.

const steps: { state: StatusState; label: string; meta: string }[] = [
  { state: "done", label: "Collected 14 release blockers", meta: "6s" },
  { state: "done", label: "Grouped into 4 themes", meta: "11s" },
  { state: "done", label: "Drafted 2 fixes", meta: "+42 −9" },
]

function RunView() {
  return (
    <DemoShell
      active="release-triage"
      crumbs={[{ label: "Agents" }, { label: "Release triage" }, { label: "Run 482" }]}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 px-9 py-7">
        <div className="flex items-end gap-6">
          <div className="flex flex-1 flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">
              Release triage · run 482 · started 4 min ago by Jordan
            </p>
            <h1 className="type-display">
              Testing the <span className="highlight px-1">two fixes</span>
            </h1>
          </div>
          <div
            aria-label="Step 4 of 6"
            className="text-[64px] leading-[.8] font-extrabold tracking-tighter"
          >
            4<span className="text-4xl text-muted-foreground">/6</span>
          </div>
        </div>

        <div className="flex gap-6">
          <ol aria-label="Run steps" className="flex flex-[1.15] flex-col border-t border-border">
            {steps.map((s) => (
              <li key={s.label} className="flex gap-3 border-b border-border py-2.25">
                <Status state={s.state} className="flex-1 text-base">
                  <span className="text-foreground">{s.label}</span>
                </Status>
                <span className="text-[13px] text-muted-foreground">{s.meta}</span>
              </li>
            ))}
            <li className="flex flex-col gap-2 border-b border-border py-2.25">
              <span className="flex gap-3">
                <Status state="running" className="flex-1 text-base font-semibold">
                  Running tests
                </Status>
                <span className="text-[13px]">38 of 61</span>
              </span>
              <Progress value={62} aria-label="Tests run" className="ml-7.5" />
            </li>
            <li className="flex gap-3 border-b border-border py-2.25">
              <Status state="needs-you" className="flex-1 text-base font-semibold">
                Post summary to #releases
              </Status>
              <Badge variant="solar">Needs you</Badge>
            </li>
            <li className="flex gap-3 py-2.25">
              <Status state="queued" className="flex-1 text-base">
                Open pull request
              </Status>
              <span className="text-[13px] text-muted-foreground">Queued</span>
            </li>
          </ol>

          <Alert
            variant="attention"
            className="flex-1 gap-3 rounded-[14px]"
            aria-labelledby="ap-h2"
          >
            <AlertTitle className="type-eyebrow">● NEEDS YOUR APPROVAL</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <h2 id="ap-h2" className="text-[25px] leading-[1.1] font-extrabold tracking-tight">
                Post this summary to #releases?
              </h2>
              <blockquote className="border-0 text-sm">
                “v2.8 triage — 4 themes, 2 fixes drafted, CI in progress. Blockers: auth redirect
                loop (fix ready), billing webhook retries (needs owner).”
              </blockquote>
              <span className="flex w-full gap-2">
                <Button className="flex-1">Approve</Button>
                <Button variant="outline" className="flex-1">
                  Reject
                </Button>
                <Button variant="outline" className="flex-1">
                  Edit
                </Button>
              </span>
              <span className="text-[13px]">Undo available for 30 seconds after you choose.</span>
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[13.5px] font-semibold">Run footprint</span>
          <Meter value={3} max={10} label="Run footprint: 0.6 of 2 Wh budget" />
          <span className="text-[13.5px] text-muted-foreground">
            est. 0.6 of 2 Wh run budget · 18k tokens · 7 tool calls
          </span>
          <span className="ml-auto text-xs text-muted-foreground">[SAMPLE DATA]</span>
        </div>

        <div className="mt-auto flex gap-2.5">
          <Input
            aria-label="Steer this run"
            placeholder="Steer this run: add context, change the plan, or ask why"
            className="h-12 flex-1 rounded-[10px] px-4"
          />
          <Button variant="hatch" size="lg" className="rounded-[10px] font-semibold">
            Defer to low-carbon window
          </Button>
          <Button size="lg" className="rounded-[10px]">
            Send now
          </Button>
        </div>
      </div>
    </DemoShell>
  )
}

const meta = {
  title: "D+/Pages/Run view",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  render: () => <RunView />,
} satisfies Meta

export default meta
type Story = StoryObj

export const Light: Story = {}

export const Dark: Story = { decorators: [withDark] }
