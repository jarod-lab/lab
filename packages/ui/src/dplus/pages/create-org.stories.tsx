import type { Meta, StoryObj } from "@storybook/react-vite"
import { Button } from "../../components/ui/button"
import { Field, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "../../components/ui/input-group"
import { Status } from "../status"
import { OrgMark } from "../org-mark"
import { DemoShell, withDark } from "./story-kit"

// Board "Org switcher → Create organization": the picker is open on "Create organization" and the
// page behind it is the create form.

function CreateOrg() {
  return (
    <DemoShell active="new" menu="org" crumbs={[{ label: "Organizations" }, { label: "New" }]}>
      <div className="flex max-w-160 flex-1 flex-col gap-5 px-12 py-9">
        <div className="flex flex-col gap-1">
          <h1 className="type-h1 text-[30px]">Create an organization</h1>
          <p className="text-secondary-foreground">
            Organizations hold your agents, members, API keys and billing. You can belong to
            several.
          </p>
        </div>
        <Field className="gap-1">
          <FieldLabel htmlFor="o-n">Organization name</FieldLabel>
          <Input id="o-n" defaultValue="Acme Labs" />
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="o-s">URL</FieldLabel>
          <InputGroup>
            <InputGroupAddon className="h-full rounded-l-[6.5px] border-r border-border bg-muted pr-3 font-mono text-[13.5px]">
              app.example.com/
            </InputGroupAddon>
            <InputGroupInput
              id="o-s"
              defaultValue="acme-labs"
              aria-describedby="o-s-ok"
              className="font-mono"
            />
          </InputGroup>
          <Status id="o-s-ok" state="done" className="text-[13.5px] font-semibold text-success">
            Available
          </Status>
        </Field>
        <div className="flex items-center gap-3.5">
          <OrgMark name="Acme" size="lg" />
          <div className="flex flex-1 flex-col">
            <span className="text-sm font-semibold">Logo</span>
            <span className="text-[13.5px] text-muted-foreground">
              Optional. We'll use the first letter until you add one.
            </span>
          </div>
          <Button variant="outline" className="h-10">
            Upload
          </Button>
        </div>
        <ol className="flex flex-col gap-1.5 rounded-[10px] border border-border px-4 py-3.5 text-sm text-secondary-foreground">
          {[
            "You'll be the Owner of Acme Labs.",
            "Next, invite teammates. You can skip this.",
            "You start on the Free plan. Upgrade anytime in Billing.",
          ].map((step, i) => (
            <li key={step} className="flex gap-2">
              <strong className="w-4.5 text-foreground">{i + 1}</strong>
              {step}
            </li>
          ))}
        </ol>
        <div className="flex gap-2.5">
          <Button size="lg">Create organization</Button>
          <Button size="lg" variant="outline">
            Cancel
          </Button>
        </div>
      </div>
    </DemoShell>
  )
}

const meta = {
  title: "D+/Pages/Create organization",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  render: () => <CreateOrg />,
} satisfies Meta

export default meta
type Story = StoryObj

export const Light: Story = {}
export const Dark: Story = { decorators: [withDark] }
