import type { Meta, StoryObj } from "@storybook/react-vite"
import { EyeIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { Button } from "../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card"
import { Field, FieldDescription, FieldLabel } from "../../components/ui/field"
import { Input } from "../../components/ui/input"
import { NativeSelect, NativeSelectOption } from "../../components/ui/native-select"
import { OrgMark } from "../org-mark"
import { SettingsHeader } from "../shell/settings-header"
import { DemoShell, withDark } from "./story-kit"

const orgTabs = [
  { id: "general", label: "General", href: "#settings/general" },
  { id: "members", label: "Members", href: "#settings/members", count: "12" },
  { id: "api-keys", label: "API keys", href: "#settings/api-keys" },
  { id: "billing", label: "Billing", href: "#settings/billing" },
  { id: "agents", label: "Agents", href: "#settings/agents" },
  { id: "integrations", label: "Integrations", href: "#settings/integrations", badge: "1 expired" },
]

// Board "Org settings — General", for an owner and for a viewer (read only).

function OrgGeneral({ viewer }: { viewer: boolean }) {
  return (
    <DemoShell
      active="settings"
      crumbs={[{ label: "Acme Inc" }, { label: "Settings" }, { label: "General" }]}
    >
      <SettingsHeader
        title="Organization settings"
        context={`Acme Inc · you are ${viewer ? "Viewer" : "Owner"}`}
        tabs={orgTabs}
        activeTab="general"
      />
      <div className="flex max-w-180 flex-1 flex-col gap-5 px-9 py-6">
        {viewer && (
          <Alert variant="notice">
            <EyeIcon />
            <AlertTitle>You have view-only access to Acme Inc.</AlertTitle>
            <AlertDescription>Ask an owner or admin to change these settings.</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field className="gap-1">
            <FieldLabel htmlFor="g-n">Organization name</FieldLabel>
            <Input id="g-n" defaultValue="Acme Inc" disabled={viewer} />
          </Field>
          <Field className="gap-1">
            <FieldLabel htmlFor="g-s">URL</FieldLabel>
            <Input id="g-s" defaultValue="acme" disabled={viewer} className="font-mono" />
            <FieldDescription className="text-[13px]">
              Changing this breaks existing links to app.example.com/acme.
            </FieldDescription>
          </Field>
        </div>
        <div className="flex items-center gap-3.5">
          <OrgMark name="Acme" size="lg" />
          <div className="flex flex-1 flex-col">
            <span className="text-sm font-semibold">Logo</span>
            <span className="text-[13.5px] text-muted-foreground">
              Square, at least 128px. SVG or PNG.
            </span>
          </div>
          {!viewer && (
            <Button variant="outline" className="h-10">
              Upload
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field className="gap-1">
            <FieldLabel htmlFor="g-r">Default role for new invites</FieldLabel>
            <NativeSelect id="g-r" disabled={viewer} className="w-full">
              <NativeSelectOption>Member</NativeSelectOption>
              <NativeSelectOption>Viewer</NativeSelectOption>
              <NativeSelectOption>Admin</NativeSelectOption>
            </NativeSelect>
          </Field>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Organization ID</span>
            <div className="flex h-11 items-center gap-2">
              <code className="flex-1 font-mono text-[13.5px] text-secondary-foreground">
                org_2Kq8vX4mT9
              </code>
              <Button
                variant="outline"
                size="sm"
                className="border-[1.5px] border-border font-semibold"
              >
                Copy
              </Button>
            </div>
          </div>
        </div>
        {viewer ? (
          <div className="flex items-center gap-4 border-t border-border pt-4">
            <div className="flex flex-1 flex-col">
              <strong>Leave Acme Inc</strong>
              <span className="text-sm text-secondary-foreground">
                You'll lose access right away. An admin can invite you again.
              </span>
            </div>
            <Button variant="destructive">Leave organization</Button>
          </div>
        ) : (
          <>
            <div className="flex justify-end gap-2.5 border-b border-border pb-1.5">
              <Button variant="outline">Discard</Button>
              <Button>Save changes</Button>
            </div>
            <Card variant="destructive" size="sm" aria-labelledby="dz">
              <CardHeader>
                <CardTitle id="dz" className="type-h3">
                  Danger zone
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5">
                <div className="flex items-center gap-4">
                  <div className="flex flex-1 flex-col">
                    <strong>Transfer ownership</strong>
                    <span className="text-sm text-secondary-foreground">
                      Make another admin the owner. You become an admin.
                    </span>
                  </div>
                  <Button variant="outline">Transfer…</Button>
                </div>
                <div className="flex items-center gap-4 border-t border-border pt-3.5">
                  <div className="flex flex-1 flex-col">
                    <strong>Delete Acme Inc</strong>
                    <span className="text-sm text-secondary-foreground">
                      Permanently deletes 4 agents, 3 API keys and all run history, removes 12
                      members, and cancels the subscription. You'll type the org name to confirm.
                    </span>
                  </div>
                  <Button variant="destructive">Delete organization</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DemoShell>
  )
}

const meta = {
  title: "D+/Pages/Org settings — General",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
  args: { viewer: false },
  render: ({ viewer }) => <OrgGeneral viewer={viewer} />,
} satisfies Meta<{ viewer: boolean }>

export default meta
type Story = StoryObj<{ viewer: boolean }>

export const Owner: Story = {}
export const Viewer: Story = { args: { viewer: true } }
export const Dark: Story = { decorators: [withDark] }
