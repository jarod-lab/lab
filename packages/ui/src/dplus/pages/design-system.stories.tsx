import type { Meta, StoryObj } from "@storybook/react-vite"
import { EyeIcon } from "lucide-react"
import type * as React from "react"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { Avatar, AvatarFallback } from "../../components/ui/avatar"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Checkbox } from "../../components/ui/checkbox"
import { Field, FieldError, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { Kbd, KbdGroup } from "../../components/ui/kbd"
import { Label } from "../../components/ui/label"
import { Progress } from "../../components/ui/progress"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Spinner } from "../../components/ui/spinner"
import { Switch } from "../../components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group"
import { Meter } from "../meter"
import { OrgMark } from "../org-mark"
import { Status, type StatusState, StatusIcon } from "../status"
import { withDark } from "./story-kit"

// Board "D+ design system — foundations, components, navigation", built only from the real tokens,
// utilities and component variants. If something on the board needs a one-off class here, it is
// missing from a component: add the variant there instead.

const Eyebrow = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="type-eyebrow text-muted-foreground">
    {children}
  </h2>
)

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Card size="sm">
    <CardHeader>
      <CardTitle className="text-[15px]">{title}</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">{children}</CardContent>
  </Card>
)

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">{children}</div>
)

const principles: [string, string][] = [
  [
    "Lean core",
    "System fonts, inline SVG, CSS variables. The core experience has to be complete before any enhancement loads.",
  ],
  [
    "Budgeted lift",
    "Every extra must be near-free in bytes, removable without breakage, and mean something. Decoration alone doesn't qualify.",
  ],
  [
    "Honest by default",
    "Yes and no get equal weight. Destructive actions say exactly what they delete. Undo where we can. Costs are visible.",
  ],
  [
    "Accessible as standard",
    "7:1 text, status = shape + word, 44px targets, real elements, visible shortcuts, only fades when less motion is asked for.",
  ],
]

const tokens = [
  "background",
  "card",
  "foreground",
  "secondary-foreground",
  "muted-foreground",
  "border",
  "input",
  "success",
  "destructive",
  "solar",
] as const

const typeScale: [string, string, string][] = [
  ["type-display", "display 38/800", "Testing the fixes"],
  ["type-h1", "h1 28/800", "Organization settings"],
  ["type-h2", "h2 22/800", "Members"],
  ["type-h3", "h3 16/700", "Pending invitations"],
  ["type-body", "body 15/400", "Agents wait for approval before anything leaves the workspace."],
  ["type-small text-muted-foreground", "small 13.5", "Last used 2 hours ago · created by Jordan"],
  ["type-mono", "mono 12.5", "ak_live_••••3f9a"],
  ["type-eyebrow text-muted-foreground", "eyebrow 12.5/800", "NEEDS YOUR APPROVAL"],
]

const statuses: StatusState[] = ["running", "needs-you", "done", "queued", "failed"]

const navModel: [string, string][] = [
  [
    "Org picker",
    "Switch org · Organization settings · Create organization. Shows your role in each org.",
  ],
  ["Sidebar", "Workspace, pinned agents, one dismissible announcement, Support."],
  ["User menu", "Personal settings · Security · Theme · Shortcuts · Sign out."],
  ["Top bar", "Breadcrumb (where am I), ⌘K (search + ask an agent), notifications."],
  [
    "Settings",
    "Level 1 = horizontal tabs with ink underline. Level 2 = pills beside the page title. No third level.",
  ],
]

const routes: [string, string[]][] = [
  ["Public", ["/sign-in", "/sign-up", "/two-factor", "/reset-password", "/invite/:id"]],
  [
    "Organization",
    [
      "/:org",
      "/:org/settings/general",
      "/:org/settings/members",
      "/:org/settings/api-keys",
      "/:org/settings/billing",
      "/new",
    ],
  ],
  ["Personal", ["/account/profile", "/account/security"]],
]

const budget: [string, string, React.ReactNode][] = [
  ["Solar fill", "0 bytes · means “you”", <span key="s" className="h-7 rounded-md bg-solar" />],
  [
    "Highlighter",
    "1 CSS rule · current item",
    <span key="h" className="h-7 text-lg font-extrabold">
      <span className="highlight px-0.75">Highlight</span>
    </span>,
  ],
  ["Hatch", "1 CSS rule · not done yet", <span key="x" className="h-7 rounded-md border hatch" />],
  [
    "Status icons",
    "inline SVG · ~250 B each",
    <span key="i" className="flex h-7 items-center gap-1.5">
      <StatusIcon state="running" className="size-5.5" />
      <StatusIcon state="needs-you" className="size-5.5" />
    </span>,
  ],
  [
    "Keycaps",
    "CSS only · shortcuts visible",
    <KbdGroup key="k" className="h-7">
      <Kbd>G</Kbd>
      <Kbd>H</Kbd>
    </KbdGroup>,
  ],
  [
    "Motion",
    "running icon only · fades only with reduced motion",
    <span key="m" className="flex h-7 items-center text-[13px] font-bold">
      transform only
    </span>,
  ],
]

function DesignSystem() {
  return (
    <div className="type-body flex w-360 flex-col gap-11 bg-background px-18 py-16 text-foreground">
      <header className="flex items-end gap-10">
        <div className="flex flex-1 flex-col gap-2.5">
          <Badge variant="solar" size="sm" className="self-start">
            DESIGN SYSTEM · D+
          </Badge>
          <h1 className="text-[52px] leading-none font-extrabold tracking-tighter">
            Lean core. <span className="highlight px-1">Budgeted lift.</span>
          </h1>
          <p className="max-w-190 text-[17px] text-secondary-foreground">
            One shell for every app we build. It works with zero downloads and no JavaScript
            styling, then adds a few near-free enhancements that each carry meaning.
          </p>
        </div>
        <div className="type-small flex flex-col gap-1 text-right text-muted-foreground">
          <span>System fonts · 0 images · 0 webfonts</span>
          <span>WCAG AAA text · keyboard-first</span>
          <span>Light + dark from the same tokens</span>
        </div>
      </header>

      <section aria-labelledby="h-pr" className="flex flex-col gap-3.5">
        <Eyebrow id="h-pr">PRINCIPLES</Eyebrow>
        <div className="grid grid-cols-4 gap-3.5">
          {principles.map(([title, body]) => (
            <Card key={title} size="sm">
              <CardHeader>
                <CardTitle className="text-[17px] font-extrabold">{title}</CardTitle>
                <CardDescription className="text-sm text-secondary-foreground">
                  {body}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-10">
        <section aria-labelledby="h-col" className="flex flex-col gap-3.5">
          <Eyebrow id="h-col">COLOR TOKENS</Eyebrow>
          <div className="type-small grid grid-cols-[170px_1fr_1fr] items-center gap-x-3.5 gap-y-2">
            <span />
            <span className="font-bold">Light</span>
            <span className="font-bold">Dark</span>
            {tokens.map((t) => (
              <div key={t} className="contents">
                <code className="type-mono">--{t}</code>
                {["light", "dark"].map((theme) => (
                  <span key={theme} className={`${theme} flex items-center gap-2`}>
                    <span
                      className="size-7 rounded-md border border-border"
                      style={{ background: `var(--${t})` }}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="type-small text-muted-foreground">
            <code className="type-mono">--solar</code> is the same in both themes, always with dark
            text. It means “needs you”.
          </p>
        </section>

        <section aria-labelledby="h-type" className="flex flex-col gap-3.5">
          <Eyebrow id="h-type">TYPE · system-ui, no downloads</Eyebrow>
          <div className="flex flex-col border-t border-border">
            {typeScale.map(([cls, label, text]) => (
              <div
                key={label}
                className="flex items-baseline gap-4.5 border-b border-border py-2.5"
              >
                <span className="type-mono w-32 shrink-0 text-muted-foreground">{label}</span>
                <span className={cls}>{text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="h-comp" className="flex flex-col gap-3.5">
        <Eyebrow id="h-comp">COMPONENTS</Eyebrow>
        <div className="grid grid-cols-3 gap-3.5">
          <Panel title="Status — shape + word">
            {statuses.map((s) => (
              <Status key={s} state={s} />
            ))}
            <Row>
              <Spinner /> <span className="text-sm">Spinner (loading)</span>
            </Row>
          </Panel>

          <Panel title="Buttons — equal weight">
            <Row>
              <Button>Save changes</Button>
              <Button variant="outline">Discard</Button>
            </Row>
            <Row>
              <Button variant="destructive">Delete organization</Button>
              <Button disabled>Viewer: read only</Button>
            </Row>
            <Row>
              <Button variant="hatch">Defer to low-carbon window</Button>
            </Row>
            <Row>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
            </Row>
            <Row>
              <Button size="lg">Large</Button>
              <Button size="sm" variant="outline">
                Small
              </Button>
              <Button size="xs" variant="outline">
                Extra small
              </Button>
            </Row>
            <Row>
              <Button size="sm" variant="outline">
                Resend
              </Button>
              <Button size="sm" variant="destructive">
                Revoke
              </Button>
              <Button size="sm" variant="outline" className="border-border">
                Copy
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="More actions">
                ⋯
              </Button>
            </Row>
            <p className="text-[13px] text-muted-foreground">
              Row actions are <code className="type-mono">size="sm"</code> (36px, 1.5px border).
              Destructive = red outline + exact consequence. Disabled = dashed border, never just
              faded. Hatch = not now, later.
            </p>
          </Panel>

          <Panel title="Inputs, switches, keycaps">
            <Field data-invalid>
              <FieldLabel htmlFor="ds-pw">Password</FieldLabel>
              <Input id="ds-pw" type="password" defaultValue="hunter22" aria-invalid />
              <FieldError>Found in a known data breach. Pick another.</FieldError>
            </Field>
            <Input aria-label="Disabled field" disabled defaultValue="Read only" />
            <Row>
              <Switch aria-label="Example on" defaultChecked />
              <Switch aria-label="Example off" />
              <Switch aria-label="Example disabled" disabled />
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </Row>
            <Row>
              <Label className="gap-2">
                <Checkbox defaultChecked /> Trust this device
              </Label>
              <RadioGroup defaultValue="a" aria-label="Example radios" className="flex gap-3">
                <Label className="gap-2">
                  <RadioGroupItem value="a" /> On
                </Label>
                <Label className="gap-2">
                  <RadioGroupItem value="b" /> Off
                </Label>
              </RadioGroup>
            </Row>
          </Panel>

          <Panel title="Badges">
            <Row>
              <Badge variant="solar">3 waiting</Badge>
              <Badge variant="solar" size="sm">
                NEW
              </Badge>
              <Badge variant="outline">Viewer</Badge>
              <Badge>Owner</Badge>
              <Badge variant="secondary">Member</Badge>
            </Row>
            <Row>
              <Badge variant="success">Paid</Badge>
              <Badge variant="destructive">Expired</Badge>
              <Badge variant="ghost">Ghost</Badge>
              <Badge variant="link">Link</Badge>
            </Row>
          </Panel>

          <Panel title="Callouts">
            <Alert variant="attention">
              <AlertTitle className="type-eyebrow">● NEEDS YOUR APPROVAL</AlertTitle>
              <AlertDescription>
                <Row>
                  <Button size="sm">Approve</Button>
                  <Button size="sm" variant="outline">
                    Reject
                  </Button>
                </Row>
              </AlertDescription>
            </Alert>
            <Alert variant="outline">
              <AlertTitle className="flex items-center gap-2">
                <Badge variant="solar" size="sm">
                  Pending
                </Badge>
                Confirm jordan@northwind.io
              </AlertTitle>
              <AlertDescription>
                Your email stays the same until you click the link.
              </AlertDescription>
            </Alert>
            <Alert variant="notice">
              <EyeIcon />
              <AlertTitle>You have view-only access.</AlertTitle>
              <AlertDescription>Ask an owner or admin to change these settings.</AlertDescription>
            </Alert>
            <Alert variant="inverse">
              <AlertTitle>
                <Badge variant="solar" size="sm">
                  NEW
                </Badge>
              </AlertTitle>
              <AlertDescription className="font-bold">
                Agents can open pull requests
              </AlertDescription>
            </Alert>
            <Alert>
              <AlertTitle>Default</AlertTitle>
              <AlertDescription>Neutral information.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>Payment failed</AlertTitle>
              <AlertDescription>Update the card to keep your seats.</AlertDescription>
            </Alert>
          </Panel>

          <Panel title="Cards">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <CardDescription>3 seats · 2 agents</CardDescription>
              </CardHeader>
            </Card>
            <Card size="sm" variant="selected">
              <CardHeader>
                <CardTitle>
                  <span className="highlight px-0.5">Pro</span>
                </CardTitle>
                <CardDescription>Current plan</CardDescription>
              </CardHeader>
            </Card>
            <Card size="sm" variant="destructive">
              <CardHeader>
                <CardTitle>Danger zone</CardTitle>
                <CardDescription>Deleting is permanent.</CardDescription>
              </CardHeader>
            </Card>
          </Panel>

          <Panel title="Progress and meters">
            <Progress value={62} aria-label="Tests run" />
            <Meter value={12} max={15} cell="tall" label="12 of 15 seats used" />
            <Meter value={3} max={10} label="0.6 of 2 Wh run budget" />
          </Panel>

          <Panel title="Navigation">
            <Tabs defaultValue="members">
              <TabsList variant="line">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="billing" disabled>
                  Billing
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs defaultValue="permissions">
              <TabsList variant="pill">
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
                <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="code">Code</TabsTrigger>
              </TabsList>
            </Tabs>
            <ToggleGroup variant="outline" spacing={0} defaultValue={["ask"]} aria-label="Autonomy">
              <ToggleGroupItem value="suggest">Suggest</ToggleGroupItem>
              <ToggleGroupItem value="ask">Ask first</ToggleGroupItem>
              <ToggleGroupItem value="auto">Autonomous</ToggleGroupItem>
            </ToggleGroup>
          </Panel>

          <Panel title="Identity">
            <Row>
              <OrgMark name="Acme" size="sm" />
              <OrgMark name="Acme" />
              <OrgMark name="Acme" size="lg" />
              <OrgMark name="Northwind" look="outline" />
              <OrgMark name="Jordan" look="personal" />
              <Avatar>
                <AvatarFallback>JL</AvatarFallback>
              </Avatar>
            </Row>
          </Panel>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-10">
        <section aria-labelledby="h-nav" className="flex flex-col gap-3.5">
          <Eyebrow id="h-nav">NAVIGATION MODEL</Eyebrow>
          <div className="flex flex-col border-t border-border text-sm">
            {navModel.map(([name, body]) => (
              <div key={name} className="flex gap-4 border-b border-border py-2.5 last:border-b-0">
                <span className="w-37.5 shrink-0 font-bold">{name}</span>
                <span>{body}</span>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="h-routes" className="flex flex-col gap-3.5">
          <Eyebrow id="h-routes">ROUTES EVERY APP SHIPS</Eyebrow>
          <div className="type-mono grid grid-cols-3 gap-3.5 leading-[1.8]">
            {routes.map(([group, paths]) => (
              <div key={group}>
                <div className="mb-1 font-sans text-[13.5px] font-bold">{group}</div>
                {paths.map((p) => (
                  <div key={p}>{p}</div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="h-bud" className="flex flex-col gap-3.5">
        <Eyebrow id="h-bud">ENHANCEMENT BUDGET</Eyebrow>
        <div className="grid grid-cols-6 gap-3">
          {budget.map(([title, note, sample]) => (
            <Card key={title} size="sm" className="gap-2 rounded-[10px] py-3.5">
              <CardContent className="flex flex-col gap-2 px-3.5">
                {sample}
                <strong className="text-sm">{title}</strong>
                <span className="text-[13px] text-muted-foreground">{note}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-sm text-secondary-foreground">
          Proposed page budget: <strong>50 KB</strong> transferred, 0 webfonts, 0 raster images in
          the shell. Anything that breaks the budget needs a written reason.
        </p>
      </section>
    </div>
  )
}

const meta = {
  title: "D+/Pages/Design system",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  render: () => <DesignSystem />,
} satisfies Meta

export default meta
type Story = StoryObj

export const Light: Story = {}
export const Dark: Story = { decorators: [withDark] }
