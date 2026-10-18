import { useForm } from "@tanstack/react-form"
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useId, useMemo, useRef, useState } from "react"
import { cn } from "cn"
import { z } from "zod"

import { Badge } from "@starter/ui/components/ui/badge"
import { Button } from "@starter/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@starter/ui/components/ui/dropdown-menu"
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
import { type RenderLink, anchorLink } from "@starter/ui/dplus/shell/link"
import { SettingsHeader } from "@starter/ui/dplus/shell/settings-header"
import { ViewOnlyNotice } from "@starter/ui/dplus/shell/view-only-notice"

import {
  ASSIGNABLE_ROLES,
  LONG_LIST,
  MATRIX_ROLES,
  MATRIX_ROLE_LABEL,
  type MatrixRowView,
  PREVIEW_ROWS,
  expiryCopy,
  lastActiveCopy,
  parseInviteEmails,
  removeConsequence,
  resetTwoFactorConsequence,
  sentCopy,
  topRoleOf,
} from "../lib/members"
import { ConfirmDialog } from "../components/confirm-dialog"
import { type InviteRole, INVITE_ROLES, INVITE_ROLE_LABEL, settingsTabs } from "../lib/org-settings"
import { messageOf } from "../lib/messages"

/** A member as the table shows them. Security fields are undefined when the caller can't see them. */
export interface MemberView {
  /** The membership id (what role changes and removal name). */
  id: string
  userId: string
  name: string
  email: string
  initials: string
  /** The stored role string, e.g. "admin". */
  role: string
  roleLabel: string
  isSelf: boolean
  /** The role menu is offered (member:update, not yourself, not an owner). */
  canChangeRole: boolean
  /** Remove is offered (member:delete, not yourself, not an owner). */
  canRemove: boolean
  /** Two-factor reset is offered (owner, another person, two-factor on). */
  canResetTwoFactor: boolean
  twoFactorEnabled?: boolean
  lastActiveAt?: string | null
}

export interface InvitationView {
  id: string
  email: string
  role: string
  roleLabel: string
  expired: boolean
  createdAt?: string
  expiresAt: string
}

export interface InviteOutcome {
  /** Addresses the server refused, with its message for each. */
  failed: { email: string; message: string }[]
}

export interface MembersPageProps {
  organization: { id: string; name: string; slug: string }
  /** "Owner", "Admin", "Member" or "Viewer": the caller's role here. */
  roleLabel: string
  /** invitation:create (owner, admin): the invite form is shown. */
  canInvite: boolean
  /** member:read (owner, admin): the Two-factor and Last active columns are shown. */
  showSecurity: boolean
  /** Invitations are only listed for a role that may manage them; undefined hides the section. */
  invitations: InvitationView[] | undefined
  /** The invitations could not be loaded: say so, rather than showing an empty list. */
  invitationsError?: string | null
  /** The stored default role for new invitations (metadata.defaultInviteRole). */
  defaultInviteRole: InviteRole
  members: MemberView[]
  /** Each role's permissions from the plugin's own check (see permissionMatrix). */
  matrix: MatrixRowView[]
  /** For "Last active" and the expiry copy. Defaults to now. */
  now?: Date
  onInvite: (emails: string[], role: InviteRole) => Promise<InviteOutcome>
  onChangeRole: (member: MemberView, role: InviteRole) => Promise<void>
  onRemove: (member: MemberView) => Promise<void>
  onResetTwoFactor: (member: MemberView) => Promise<void>
  onResend: (invitation: InvitationView) => Promise<void>
  onCancel: (invitation: InvitationView) => Promise<void>
  renderLink?: RenderLink
}

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, MemberView>()

// Security columns drop out on a phone (below md) so the table never scrolls sideways.
const PHONE_HIDDEN = new Set(["twoFactor", "lastActive"])

const schema = z.object({
  emails: z.string().superRefine((value, ctx) => {
    const { emails, invalid } = parseInviteEmails(value)
    if (invalid.length > 0) {
      ctx.addIssue({ code: "custom", message: `Check these addresses: ${invalid.join(", ")}` })
    } else if (emails.length === 0) {
      ctx.addIssue({ code: "custom", message: "Enter at least one email address." })
    }
  }),
  role: z.enum(INVITE_ROLES),
})

type InviteValues = z.infer<typeof schema>

type MemberAction = { kind: "remove" | "reset"; member: MemberView }

/** The members page (board OrgMembers). Props in, callbacks out. */
export function MembersPage({
  organization,
  roleLabel,
  canInvite,
  showSecurity,
  invitations,
  invitationsError,
  defaultInviteRole,
  members,
  matrix,
  now,
  onInvite,
  onChangeRole,
  onRemove,
  onResetTwoFactor,
  onResend,
  onCancel,
  renderLink = anchorLink,
}: MembersPageProps) {
  const when = useMemo(() => now ?? new Date(), [now])
  const [showAll, setShowAll] = useState(false)
  const [action, setAction] = useState<MemberAction | null>(null)
  const [pendingCancel, setPendingCancel] = useState<InvitationView | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // A confirm runs once: the ref catches a second click that lands before the button re-renders.
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false)
  // Each dialog keeps the target it last showed, so its text stays whole while it animates out.
  const [shownAction, setShownAction] = useState<MemberAction | null>(null)
  const [shownCancel, setShownCancel] = useState<InvitationView | null>(null)
  if (action && action !== shownAction) setShownAction(action)
  if (pendingCancel && pendingCancel !== shownCancel) setShownCancel(pendingCancel)
  const dialogAction = action ?? shownAction
  const dialogCancel = pendingCancel ?? shownCancel
  const [inviteFailures, setInviteFailures] = useState<InviteOutcome["failed"]>([])
  const emailsId = useId()
  const roleId = useId()
  const scrollRef = useRef<HTMLDivElement>(null)

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "member",
          header: "Member",
          cell: (info) => {
            const m = info.row.original
            return (
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] border-foreground text-xs font-semibold"
                >
                  {m.initials}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="font-semibold">
                    {m.name || m.email}
                    {m.isSelf ? " (you)" : ""}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">{m.email}</span>
                </span>
              </div>
            )
          },
        }),
        helper.display({
          id: "role",
          header: "Role",
          cell: (info) => {
            const m = info.row.original
            if (!m.canChangeRole) return <span className="font-bold">{m.roleLabel}</span>
            return (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      aria-label={`Role for ${m.name || m.email}: ${m.roleLabel}`}
                      className="min-h-9 justify-between gap-1.5 rounded-lg px-2.5 font-normal"
                    >
                      {m.roleLabel}
                      <span aria-hidden="true" className="text-muted-foreground">
                        ▾
                      </span>
                    </Button>
                  }
                />
                <DropdownMenuContent align="start">
                  <DropdownMenuRadioGroup
                    value={topRoleOf(m.role)}
                    onValueChange={(value) => {
                      const next = ASSIGNABLE_ROLES.find((r) => r === value)
                      if (!next || next === topRoleOf(m.role)) return
                      setActionError(null)
                      void onChangeRole(m, next).catch((caught: unknown) =>
                        setActionError(messageOf(caught)),
                      )
                    }}
                  >
                    {ASSIGNABLE_ROLES.map((role) => (
                      <DropdownMenuRadioItem key={role} value={role}>
                        {INVITE_ROLE_LABEL[role]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )
          },
        }),
        ...(showSecurity
          ? [
              helper.display({
                id: "twoFactor",
                header: "Two-factor",
                cell: (info) => {
                  const m = info.row.original
                  if (m.twoFactorEnabled === undefined) return "—"
                  return m.twoFactorEnabled ? (
                    <span className="inline-flex items-center gap-1.5 text-success">
                      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                        <path
                          d="M3.5 8.5l3 3 6-7"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-foreground">On</span>
                    </span>
                  ) : (
                    <Badge className="rounded-sm bg-solar px-1.5 font-extrabold text-solar-foreground">
                      Off
                    </Badge>
                  )
                },
              }),
              helper.display({
                id: "lastActive",
                header: "Last active",
                cell: (info) => {
                  const m = info.row.original
                  return m.lastActiveAt === undefined ? (
                    "—"
                  ) : (
                    <span className="text-muted-foreground">
                      {lastActiveCopy(m.lastActiveAt, when)}
                    </span>
                  )
                },
              }),
            ]
          : []),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: (info) => {
            const m = info.row.original
            if (!m.canRemove && !m.canResetTwoFactor) return null
            return (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      aria-label={`More actions for ${m.name || m.email}`}
                      className="size-11 text-lg"
                    >
                      ⋯
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  {m.canResetTwoFactor ? (
                    <DropdownMenuItem onClick={() => setAction({ kind: "reset", member: m })}>
                      Reset two-factor
                    </DropdownMenuItem>
                  ) : null}
                  {m.canRemove ? (
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setAction({ kind: "remove", member: m })}
                    >
                      Remove from organization
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          },
        }),
      ]),
    [onChangeRole, showSecurity, when],
  )

  const table = useTable({ features, columns, data: members })
  const rows = table.getRowModel().rows
  const virtual = showAll && rows.length > LONG_LIST
  const previewCount = showAll ? rows.length : Math.min(PREVIEW_ROWS, rows.length)

  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 6,
    initialRect: { width: 0, height: 480 },
  })

  const columnCount = columns.length
  const phoneClass = (id: string) => (PHONE_HIDDEN.has(id) ? "hidden md:table-cell" : undefined)

  const renderRow = (index: number) => {
    const row = rows[index]
    if (!row) return null
    return (
      <TableRow key={row.id}>
        {row.getAllCells().map((cell) => (
          <TableCell key={cell.id} className={phoneClass(cell.column.id)}>
            <table.FlexRender cell={cell} />
          </TableCell>
        ))}
      </TableRow>
    )
  }

  const items = virtual ? virtualizer.getVirtualItems() : []
  const paddingTop = virtual ? (items[0]?.start ?? 0) : 0
  const paddingBottom = virtual
    ? Math.max(0, virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0))
    : 0

  const confirmAction = async () => {
    if (!action || confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)
    setActionError(null)
    try {
      if (action.kind === "remove") await onRemove(action.member)
      else await onResetTwoFactor(action.member)
      setAction(null)
    } catch (caught) {
      setActionError(messageOf(caught))
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  const confirmCancel = async () => {
    if (!pendingCancel || confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)
    setActionError(null)
    try {
      await onCancel(pendingCancel)
      setPendingCancel(null)
    } catch (caught) {
      setActionError(messageOf(caught))
    } finally {
      confirmingRef.current = false
      setConfirming(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title="Organization settings"
        context={`${organization.name} · you are ${roleLabel}`}
        tabs={settingsTabs(organization.slug)}
        activeTab="members"
        renderLink={renderLink}
      />

      <div className="flex max-w-[1040px] flex-col gap-6 px-4 py-6 md:px-9">
        {canInvite ? (
          <InviteForm
            emailsId={emailsId}
            roleId={roleId}
            defaultRole={defaultInviteRole}
            failures={inviteFailures}
            onInvite={async (emails, role) => {
              const outcome = await onInvite(emails, role)
              setInviteFailures(outcome.failed)
              return outcome
            }}
          />
        ) : (
          <ViewOnlyNotice subject={organization.name}>
            Only owners and admins can invite and manage members.
          </ViewOnlyNotice>
        )}

        {actionError ? (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        ) : null}

        <section aria-labelledby="members-heading" className="flex flex-col gap-2">
          <h2 id="members-heading" className="text-base font-bold">
            Members
          </h2>
          <div
            ref={scrollRef}
            role={virtual ? "region" : undefined}
            aria-label={virtual ? "Members, scrollable" : undefined}
            tabIndex={virtual ? 0 : undefined}
            className={virtual ? "max-h-[480px] overflow-y-auto" : undefined}
          >
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {table.getHeaderGroups()[0]?.headers.map((header) => (
                    <TableHead key={header.id} className={phoneClass(header.column.id)}>
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {virtual ? (
                  <>
                    {paddingTop > 0 ? (
                      <TableRow aria-hidden="true" className="hover:bg-transparent">
                        <TableCell
                          colSpan={columnCount}
                          className="p-0"
                          style={{ height: paddingTop }}
                        />
                      </TableRow>
                    ) : null}
                    {items.map((item) => renderRow(item.index))}
                    {paddingBottom > 0 ? (
                      <TableRow aria-hidden="true" className="hover:bg-transparent">
                        <TableCell
                          colSpan={columnCount}
                          className="p-0"
                          style={{ height: paddingBottom }}
                        />
                      </TableRow>
                    ) : null}
                  </>
                ) : (
                  Array.from({ length: previewCount }, (_, index) => renderRow(index))
                )}
              </TableBody>
            </Table>
          </div>
          {!showAll && rows.length > PREVIEW_ROWS ? (
            <Button
              variant="link"
              className="min-h-11 self-start px-0 text-foreground"
              onClick={() => setShowAll(true)}
            >
              Show all {rows.length} members
            </Button>
          ) : null}
        </section>

        <div className="grid gap-7 md:grid-cols-2">
          {invitations ? (
            <section aria-labelledby="pending-heading" className="flex flex-col">
              <h2 id="pending-heading" className="mb-1.5 text-base font-bold">
                Pending invitations
              </h2>
              {invitationsError ? (
                <p role="alert" className="border-t border-border py-3 text-sm text-destructive">
                  {invitationsError}
                </p>
              ) : null}
              {invitations.length === 0 && !invitationsError ? (
                <p className="border-t border-border py-3 text-sm text-muted-foreground">
                  No pending invitations.
                </p>
              ) : null}
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center gap-3 border-t border-border py-2.5 last:border-b"
                >
                  <div className="flex min-w-0 flex-1 flex-col leading-snug">
                    <span className="truncate font-semibold">
                      {invitation.email} · {invitation.roleLabel}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
                      {invitation.expired ? (
                        <>
                          <Badge className="rounded-sm bg-solar px-1.5 font-extrabold text-solar-foreground">
                            Expired
                          </Badge>
                          {sentCopy(invitation.createdAt, when).toLowerCase()}
                        </>
                      ) : (
                        `${sentCopy(invitation.createdAt, when)} · ${expiryCopy(invitation.expiresAt, when)}`
                      )}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    className="min-h-11 px-3"
                    onClick={() => {
                      setActionError(null)
                      void onResend(invitation).catch((caught: unknown) =>
                        setActionError(messageOf(caught)),
                      )
                    }}
                  >
                    Resend
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11 px-3"
                    onClick={() => setPendingCancel(invitation)}
                  >
                    {invitation.expired ? "Remove" : "Revoke"}
                  </Button>
                </div>
              ))}
            </section>
          ) : null}

          <section aria-labelledby="matrix-heading" className="flex flex-col">
            <h2 id="matrix-heading" className="mb-1.5 text-base font-bold">
              What each role can do
            </h2>
            {/* A reference, not a data table: the board draws it unboxed and compact, its
                labels flush with the heading, rather than in the boxed Table. */}
            <table className="w-full border-collapse text-[13.5px] [&_td]:py-1.5 [&_th]:py-1.5 [&_tr]:border-b">
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="text-left font-semibold">
                    <span className="sr-only">Permission</span>
                  </th>
                  {MATRIX_ROLES.map((role) => (
                    <th
                      key={role}
                      scope="col"
                      className={cn("font-semibold", role === "member" ? "w-16" : "w-14.5")}
                    >
                      {MATRIX_ROLE_LABEL[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="text-left font-normal">
                      {row.label}
                    </th>
                    {MATRIX_ROLES.map((role) => (
                      <td key={role} className="text-center font-bold">
                        <span aria-hidden="true">{row.cells[role] ? "✓" : "—"}</span>
                        <span className="sr-only">{row.cells[role] ? "Yes" : "No"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null)
        }}
        title={
          dialogAction?.kind === "remove"
            ? `Remove ${dialogAction.member.name || dialogAction.member.email}?`
            : `Reset two-factor for ${dialogAction?.member.name || dialogAction?.member.email}?`
        }
        description={
          dialogAction?.kind === "remove"
            ? removeConsequence(dialogAction.member.name || dialogAction.member.email)
            : dialogAction
              ? resetTwoFactorConsequence(dialogAction.member.name || dialogAction.member.email)
              : undefined
        }
        confirmLabel={dialogAction?.kind === "remove" ? "Remove member" : "Reset two-factor"}
        destructive
        pending={confirming}
        error={actionError}
        onConfirm={() => void confirmAction()}
      />

      <ConfirmDialog
        open={pendingCancel !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null)
        }}
        title={`${dialogCancel?.expired ? "Remove" : "Revoke"} the invitation for ${dialogCancel?.email}?`}
        description="The link in their email stops working. Nothing else changes; you can invite them again."
        confirmLabel={dialogCancel?.expired ? "Remove invitation" : "Revoke invitation"}
        destructive
        pending={confirming}
        onConfirm={() => void confirmCancel()}
      />
    </div>
  )
}

function InviteForm({
  emailsId,
  roleId,
  defaultRole,
  failures,
  onInvite,
}: {
  emailsId: string
  roleId: string
  defaultRole: InviteRole
  failures: InviteOutcome["failed"]
  onInvite: (emails: string[], role: InviteRole) => Promise<InviteOutcome>
}) {
  const emailsHelpId = useId()
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { emails: "", role: defaultRole } as InviteValues,
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const { emails } = parseInviteEmails(value.emails)
      try {
        const outcome = await onInvite(emails, value.role)
        if (outcome.failed.length === 0) form.reset()
      } catch (caught) {
        setServerError(messageOf(caught))
      }
    },
  })

  return (
    <form
      noValidate
      aria-label="Invite members"
      className="grid gap-y-1 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end sm:gap-x-2.5"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {/* On the board the inputs and the button share one bottom edge. The email help and error
          sit under the email input: below the row when wide, before Role on a phone. */}
      <form.Field name="emails">
        {(field) => (
          <Field className="min-w-0">
            <FieldLabel htmlFor={emailsId}>Invite by email</FieldLabel>
            <Input
              id={emailsId}
              name="emails"
              value={field.state.value}
              placeholder="name@company.com, another@company.com"
              aria-describedby={emailsHelpId}
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
              onChange={(event) => field.handleChange(event.currentTarget.value)}
              onBlur={field.handleBlur}
            />
          </Field>
        )}
      </form.Field>
      <FieldDescription id={emailsHelpId} className="sm:col-start-1">
        Separate addresses with commas.
      </FieldDescription>
      <form.Subscribe selector={(state) => state.fieldMeta.emails?.errors ?? []}>
        {(errors) =>
          errors.length > 0 ? (
            <FieldError className="sm:col-start-1">{messageOfIssue(errors)}</FieldError>
          ) : null
        }
      </form.Subscribe>
      <form.Field name="role">
        {(field) => (
          <Field className="max-sm:mt-2 sm:col-start-2 sm:row-start-1">
            <FieldLabel htmlFor={roleId}>Role</FieldLabel>
            <NativeSelect
              id={roleId}
              name="role"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.currentTarget.value as InviteRole)}
              onBlur={field.handleBlur}
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <NativeSelectOption key={role} value={role}>
                  {INVITE_ROLE_LABEL[role]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            type="submit"
            className="min-h-11 px-4.5 font-bold max-sm:mt-2.5 sm:col-start-3 sm:row-start-1"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending…" : "Send invites"}
          </Button>
        )}
      </form.Subscribe>
      {serverError || failures.length > 0 ? (
        <div role="alert" className="text-sm text-destructive sm:col-span-3">
          {serverError ? <p>{serverError}</p> : null}
          {failures.map((failure) => (
            <p key={failure.email}>
              {failure.email}: {failure.message}
            </p>
          ))}
        </div>
      ) : null}
    </form>
  )
}

/** The first validation message for a field (a Zod issue, or a plain string). */
function messageOfIssue(errors: unknown[]): string {
  const first = errors[0]
  if (typeof first === "string") return first
  if (first && typeof first === "object" && "message" in first) return String(first.message)
  return "Check this field."
}
