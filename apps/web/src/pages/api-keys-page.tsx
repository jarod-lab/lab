import { useForm } from "@tanstack/react-form"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { useId, useMemo, useState } from "react"
import { z } from "zod"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@starter/ui/components/ui/alert-dialog"
import { Badge } from "@starter/ui/components/ui/badge"
import { Button } from "@starter/ui/components/ui/button"
import { Checkbox } from "@starter/ui/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@starter/ui/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@starter/ui/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@starter/ui/components/ui/table"
import { CopyField } from "@starter/ui/dplus/shell/copy-field"
import { type RenderLink, anchorLink } from "@starter/ui/dplus/shell/link"
import { SettingsHeader } from "@starter/ui/dplus/shell/settings-header"
import { ViewOnlyNotice } from "@starter/ui/dplus/shell/view-only-notice"

import {
  EXPIRY_OPTIONS,
  type PermissionOption,
  accessSummary,
  isUnused,
  secretNotice,
  toPermissionsRecord,
} from "../lib/api-keys"
import type { ApiKey, CreateApiKeyInput } from "../lib/api-keys-api"
import { settingsTabs } from "../lib/org-settings"
import { messageOf } from "../lib/messages"

export interface ApiKeysPageProps {
  organization: { id: string; name: string; slug: string }
  /** "Owner", "Admin", "Member" or "Viewer": the caller's role here. */
  roleLabel: string
  /** apiKey:delete (owner, admin): the list is shown. Other roles get the view-only notice. */
  canList: boolean
  /** apiKey:create (owner, admin): the Create button is enabled. */
  canCreate: boolean
  /** The organization's keys, once loaded. */
  keys: ApiKey[] | undefined
  keysPending: boolean
  keysError: string | null
  onRetry: () => void
  /** The permissions the caller may grant, for the picker. */
  permissionOptions: PermissionOption[]
  /** The secret of the key just created. Shown once; cleared by the page's dismiss button. */
  secret: { name: string; key: string } | null
  onDismissSecret: () => void
  /** Rejects with the server's message when the key is refused. */
  onCreate: (input: CreateApiKeyInput) => Promise<void>
  onRevoke: (key: ApiKey) => Promise<void>
  /** For the "unused 90+ days" flag. Defaults to now. */
  now?: Date
  renderLink?: RenderLink
}

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, ApiKey>()
const NO_KEYS: ApiKey[] = []

// Columns that drop out on a phone so the table never scrolls sideways.
const PHONE_HIDDEN = new Set(["access", "createdAt"])

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" })

/** The organization's API keys (board OrgApiKeys). Props in, callbacks out. */
export function ApiKeysPage({
  organization,
  roleLabel,
  canList,
  canCreate,
  keys,
  keysPending,
  keysError,
  onRetry,
  permissionOptions,
  secret,
  onDismissSecret,
  onCreate,
  onRevoke,
  now,
  renderLink = anchorLink,
}: ApiKeysPageProps) {
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<ApiKey | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const when = useMemo(() => now ?? new Date(), [now])

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: "Name",
          cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
        }),
        helper.accessor("access", {
          header: "Access",
          cell: (info) => accessSummary(info.getValue()),
        }),
        helper.accessor("createdAt", {
          header: "Created",
          cell: (info) => (
            <span className="text-muted-foreground">{formatDate(info.getValue())}</span>
          ),
        }),
        helper.accessor("lastUsedAt", {
          header: "Last used",
          cell: (info) => {
            const key = info.row.original
            if (isUnused(key, when)) {
              return (
                <Badge className="rounded-sm bg-solar text-solar-foreground">Unused 90+ days</Badge>
              )
            }
            const value = info.getValue()
            return value ? formatDate(value) : "Never"
          },
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: (info) => (
            <Button
              variant="outline"
              aria-label={`Revoke ${info.row.original.name}`}
              className="min-h-11 border-destructive text-destructive hover:text-destructive"
              onClick={() => {
                setRevokeError(null)
                setRevoking(info.row.original)
              }}
            >
              Revoke
            </Button>
          ),
        }),
      ]),
    [when],
  )

  const table = useTable({ features, columns, data: keys ?? NO_KEYS })

  const tabs = settingsTabs(organization.slug)

  async function confirmRevoke() {
    if (!revoking) return
    setRevokeError(null)
    try {
      await onRevoke(revoking)
      setRevoking(null)
    } catch (caught) {
      setRevokeError(messageOf(caught))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title="Organization settings"
        context={`${organization.name} · you are ${roleLabel}`}
        tabs={tabs}
        activeTab="api-keys"
        renderLink={renderLink}
      />

      <main className="flex max-w-[960px] flex-col gap-5 px-4 py-6 md:px-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-[22px] font-extrabold tracking-tight">API keys</h2>
            <p className="max-w-[560px] text-[14.5px] text-muted-foreground">
              Keys act as {organization.name}, not as a person. Anyone holding a key can use it, so
              treat it like a password.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              className="min-h-11 px-4.5 font-bold disabled:border-dashed disabled:border-muted-foreground"
              disabled={!canCreate}
              aria-describedby={canCreate ? undefined : "create-reason"}
              onClick={() => setCreating(true)}
            >
              Create API key
            </Button>
            {canCreate ? null : (
              <span id="create-reason" className="text-sm text-muted-foreground">
                Only owners and admins can create keys.
              </span>
            )}
          </div>
        </div>

        {secret ? (
          <section
            aria-labelledby="secret-heading"
            className="flex flex-col gap-3 rounded-xl bg-solar p-4 text-solar-foreground"
          >
            <h3 id="secret-heading" className="text-base font-extrabold">
              {secretNotice(secret.name)}
            </h3>
            <CopyField
              label="Secret key"
              value={secret.key}
              className="text-solar-foreground [&_input]:bg-background [&_input]:text-foreground [&_output]:text-solar-foreground"
            />
            <Button variant="outline" className="self-start" onClick={onDismissSecret}>
              I've saved it
            </Button>
          </section>
        ) : null}

        {canList ? null : (
          <ViewOnlyNotice subject={organization.name}>
            Only owners and admins can see and manage API keys.
          </ViewOnlyNotice>
        )}

        {canList && keysError ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-destructive">
            <p>{keysError}</p>
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : null}

        {canList && keysPending && !keys ? (
          <output className="block text-muted-foreground">Loading…</output>
        ) : null}

        {canList && keys && keys.length === 0 ? (
          <section className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-border p-5">
            <h3 className="font-bold">No API keys yet</h3>
            <p className="text-muted-foreground">
              Create a key for a CI job, a support bot or another tool that acts for{" "}
              {organization.name}.
            </p>
          </section>
        ) : null}

        {canList && keys && keys.length > 0 ? (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id} className="hover:bg-transparent">
                  {group.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className={
                        PHONE_HIDDEN.has(header.column.id) ? "hidden md:table-cell" : undefined
                      }
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        PHONE_HIDDEN.has(cell.column.id) ? "hidden md:table-cell" : undefined
                      }
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}

        {canList ? (
          <div className="flex flex-col gap-2 text-[13.5px] text-muted-foreground sm:flex-row sm:gap-6">
            <span className="flex items-center gap-2">
              <Badge className="rounded-sm bg-solar text-solar-foreground">Unused 90+ days</Badge>
              consider revoking
            </span>
            <span>Only owners and admins can see this page. Revoking takes effect at once.</span>
          </div>
        ) : null}
      </main>

      <CreateKeyDialog
        open={creating}
        onOpenChange={setCreating}
        organizationName={organization.name}
        options={permissionOptions}
        onCreate={onCreate}
      />

      <AlertDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Agents using this key stop working immediately. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError ? (
            <p role="alert" className="text-sm text-destructive">
              {revokeError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              className="border-destructive bg-transparent text-destructive hover:text-destructive"
              variant="outline"
              onClick={() => void confirmRevoke()}
            >
              Revoke key
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** The first validation message for a field (a Zod issue, or a plain string). */
function fieldMessage(errors: unknown[]): string {
  const first = errors[0]
  if (typeof first === "string") return first
  if (first && typeof first === "object" && "message" in first) return String(first.message)
  return "Check this field."
}

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the key a name, so you know what uses it.")
    .max(100, "Use 100 characters or fewer."),
  permissions: z.array(z.string()).min(1, "Choose at least one permission."),
  expiry: z.string(),
})

type CreateValues = z.infer<typeof createSchema>

function CreateKeyDialog({
  open,
  onOpenChange,
  organizationName,
  options,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationName: string
  options: PermissionOption[]
  onCreate: (input: CreateApiKeyInput) => Promise<void>
}) {
  const nameId = useId()
  const expiryId = useId()
  const [serverError, setServerError] = useState<string | null>(null)
  const defaults: CreateValues = {
    name: "",
    permissions: options.some((option) => option.key === "project:read") ? ["project:read"] : [],
    expiry: "",
  }

  const form = useForm({
    defaultValues: defaults,
    validators: { onChange: createSchema },
    onSubmit: async ({ value }) => {
      setServerError(null)
      try {
        await onCreate({
          name: value.name.trim(),
          permissions: toPermissionsRecord(value.permissions),
          expiresInDays: value.expiry ? Number(value.expiry) : undefined,
        })
        form.reset()
        onOpenChange(false)
      } catch (caught) {
        setServerError(messageOf(caught))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            The key acts as {organizationName}. It can hold only permissions you have yourself.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                <Input
                  id={nameId}
                  name="name"
                  value={field.state.value}
                  placeholder="CI deploy"
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                />
                {field.state.meta.errors.length > 0 ? (
                  <FieldError>{fieldMessage(field.state.meta.errors)}</FieldError>
                ) : null}
              </Field>
            )}
          </form.Field>

          <form.Field name="permissions">
            {(field) => (
              <fieldset className="flex flex-col gap-2.5">
                <legend className="text-sm font-semibold">Permissions</legend>
                {options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Your role has no permissions a key can hold.
                  </p>
                ) : null}
                {options.map((option) => {
                  const checkId = `${option.key}-${nameId}`
                  const checked = field.state.value.includes(option.key)
                  return (
                    <div key={option.key} className="flex items-center gap-3">
                      <Checkbox
                        id={checkId}
                        checked={checked}
                        onCheckedChange={(next) =>
                          field.handleChange(
                            next
                              ? [...field.state.value, option.key]
                              : field.state.value.filter((item) => item !== option.key),
                          )
                        }
                      />
                      <label htmlFor={checkId} className="text-sm">
                        {option.label}
                      </label>
                    </div>
                  )
                })}
                <FieldDescription>
                  Only what you can do yourself. Owner-only settings are not offered.
                </FieldDescription>
                {field.state.meta.errors.length > 0 ? (
                  <FieldError>{fieldMessage(field.state.meta.errors)}</FieldError>
                ) : null}
              </fieldset>
            )}
          </form.Field>

          <form.Field name="expiry">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={expiryId}>Expires</FieldLabel>
                <NativeSelect
                  id={expiryId}
                  name="expiry"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <NativeSelectOption key={option.label} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </form.Field>

          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          ) : null}

          <DialogFooter>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating…" : "Create key"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
