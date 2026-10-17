import { useForm } from "@tanstack/react-form"
import { useId, useState, type ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@starter/ui/components/ui/alert-dialog"
import { Button } from "@starter/ui/components/ui/button"
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
import { Textarea } from "@starter/ui/components/ui/textarea"
import { Status } from "@starter/ui/dplus/status"
import { DangerAction, DangerZone } from "@starter/ui/dplus/shell/danger-zone"
import { type RenderLink, anchorLink } from "@starter/ui/dplus/shell/link"
import { SettingsHeader } from "@starter/ui/dplus/shell/settings-header"

import { messageOf } from "../lib/messages"
import { BudgetSection } from "./workspace-agents-budget"
import { settingsTabs } from "../lib/org-settings"
import {
  ACTIVITY_STATUS,
  ALWAYS_ASK,
  AUTONOMY_HINT,
  AUTONOMY_LABEL,
  type AgentView,
  agentFormSchema,
  changedPermissions,
  deleteConsequence,
  permissionsOf,
  unsavedCopy,
  type AgentFormValues,
} from "../lib/workspace-agents"
import type {
  AgentPatch,
  Autonomy,
  CreateAgentInput,
  PermissionSettings,
  WorkspaceAgent,
} from "../lib/workspace-agents-api"

const AUTONOMY: Autonomy[] = ["suggest_only", "ask_first", "autonomous"]

const VIEW_PILLS: { id: AgentView; label: string }[] = [
  { id: "permissions", label: "Permissions" },
  { id: "guardrails", label: "Guardrails" },
  { id: "budgets", label: "Budgets & footprint" },
  { id: "connected", label: "Connected" },
]

export interface WorkspaceAgentsPageProps {
  organization: { id: string; name: string; slug: string }
  /** "Owner", "Admin", "Member" or "Viewer": the caller's role here. */
  roleLabel: string
  view: AgentView
  /** The connected-agents view (API keys and OAuth clients), shown for the "Connected" pill. */
  connected: ReactNode
  /** agent:read: the list is shown. Every role has it; a missing role shows nothing. */
  canRead: boolean
  /** agent:create (owner, admin, member). */
  canCreate: boolean
  /** agent:update (owner, admin, member): settings, rename and pinning. Viewers get view-only. */
  canUpdate: boolean
  /** agent:delete (owner, admin). */
  canDelete: boolean
  agents: WorkspaceAgent[] | undefined
  agentsPending: boolean
  agentsError: string | null
  onRetry: () => void
  /** The agent the permissions board is about. */
  selected: WorkspaceAgent | undefined
  /** The number of runs the selected agent has, once counted (owner and admin only). */
  runCount: number | undefined
  /** The last change that the server refused. */
  actionError: string | null
  onSelect: (agentId: string | null) => void
  onCreate: (input: CreateAgentInput) => Promise<void>
  onUpdate: (id: string, patch: AgentPatch) => Promise<void>
  onRemove: (id: string) => Promise<void>
  renderLink?: RenderLink
}

/**
 * The organization's workspace agents (board DirLiftSettings): the list with status and pinning, and
 * the selected agent's permissions. Props in, callbacks out.
 */
export function WorkspaceAgentsPage({
  organization,
  roleLabel,
  view,
  connected,
  canRead,
  canCreate,
  canUpdate,
  canDelete,
  agents,
  agentsPending,
  agentsError,
  onRetry,
  selected,
  runCount,
  actionError,
  onSelect,
  onCreate,
  onUpdate,
  onRemove,
  renderLink = anchorLink,
}: WorkspaceAgentsPageProps) {
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const pills = VIEW_PILLS.map((pill) => ({
    id: pill.id,
    label: pill.label,
    href:
      pill.id === "permissions"
        ? `/${organization.slug}/settings/agents`
        : `/${organization.slug}/settings/agents?view=${pill.id}`,
  }))
  const tabs = settingsTabs(organization.slug)

  async function confirmRemove() {
    if (!selected) return
    setRemoveError(null)
    try {
      await onRemove(selected.id)
      setRemoving(false)
      onSelect(null)
    } catch (caught) {
      setRemoveError(messageOf(caught))
    }
  }

  // The connected view brings its own <main>, so it is not wrapped in the page's.
  const body =
    view === "connected" ? (
      connected
    ) : (
      <main className="flex max-w-[1040px] flex-col gap-5 px-4 py-6 md:px-9">
        {view === "guardrails" ? (
          <PlaceholderSection
            heading="Guardrails"
            reason="[PLACEHOLDER] The API has no guardrail settings yet, so nothing on this tab can be changed."
          />
        ) : view === "budgets" ? (
          <BudgetSection
            key={selected?.id ?? "none"}
            agent={canRead ? selected : undefined}
            canUpdate={canUpdate}
            onSave={(id, energyBudgetWh) => onUpdate(id, { energyBudgetWh })}
          />
        ) : (
          <PermissionsView
            organization={organization}
            canRead={canRead}
            canCreate={canCreate}
            canUpdate={canUpdate}
            canDelete={canDelete}
            agents={agents}
            agentsPending={agentsPending}
            agentsError={agentsError}
            onRetry={onRetry}
            selected={selected}
            runCount={runCount}
            actionError={actionError}
            onSelect={onSelect}
            onCreateOpen={() => setCreating(true)}
            onRenameOpen={() => setRenaming(true)}
            onUpdate={onUpdate}
            onRemoveOpen={() => {
              setRemoveError(null)
              setRemoving(true)
            }}
            renderLink={renderLink}
          />
        )}
      </main>
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsHeader
        title="Organization settings"
        context={`${organization.name} · you are ${roleLabel}`}
        tabs={tabs}
        activeTab="agents"
        pills={pills}
        activePill={view}
        viewOnly={canRead && !canUpdate ? organization.name : undefined}
        renderLink={renderLink}
      />

      {body}

      <AgentFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Create agent"
        description={`The agent works for ${organization.name}. It starts with Ask first, and its three always-ask actions on.`}
        submitLabel="Create agent"
        initial={{ name: "", description: "" }}
        onSubmit={async (values) => {
          await onCreate({ name: values.name, description: values.description || null })
          setCreating(false)
        }}
      />

      {selected && canUpdate ? (
        <AgentFormDialog
          key={`${selected.id}:${selected.name}:${selected.description ?? ""}`}
          open={renaming}
          onOpenChange={setRenaming}
          title="Edit agent details"
          description="The name is shown in the sidebar and the run list."
          submitLabel="Save details"
          initial={{ name: selected.name, description: selected.description ?? "" }}
          onSubmit={async (values) => {
            await onUpdate(selected.id, {
              name: values.name,
              description: values.description || null,
            })
            setRenaming(false)
          }}
        />
      ) : null}

      {selected && canDelete ? (
        <AlertDialog
          open={removing}
          onOpenChange={(open) => {
            if (!open) setRemoving(false)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selected.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteConsequence(selected.name, runCount)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeError ? (
              <p role="alert" className="text-sm text-destructive">
                {removeError}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="outline"
                className="border-destructive bg-transparent text-destructive hover:text-destructive"
                onClick={() => void confirmRemove()}
              >
                Delete agent
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}

function PlaceholderSection({ heading, reason }: { heading: string; reason: string }) {
  return (
    <section
      aria-labelledby="placeholder-heading"
      className="flex max-w-[640px] flex-col gap-2 rounded-lg border-2 border-dashed border-muted-foreground p-5"
    >
      <h2 id="placeholder-heading" className="text-[18px] font-bold">
        {heading}
      </h2>
      <p className="text-sm text-muted-foreground">{reason}</p>
    </section>
  )
}

type PermissionsViewProps = Pick<
  WorkspaceAgentsPageProps,
  | "canRead"
  | "canCreate"
  | "canUpdate"
  | "canDelete"
  | "agents"
  | "agentsPending"
  | "agentsError"
  | "onRetry"
  | "selected"
  | "runCount"
  | "actionError"
  | "onSelect"
  | "onUpdate"
  | "renderLink"
> & {
  organization: { id: string; name: string; slug: string }
  onCreateOpen: () => void
  onRenameOpen: () => void
  onRemoveOpen: () => void
}

function PermissionsView({
  organization,
  canRead,
  canCreate,
  canUpdate,
  canDelete,
  agents,
  agentsPending,
  agentsError,
  onRetry,
  selected,
  runCount,
  actionError,
  onSelect,
  onCreateOpen,
  onRenameOpen,
  onUpdate,
  onRemoveOpen,
  renderLink = anchorLink,
}: PermissionsViewProps) {
  const headingId = useId()
  const createReason = canCreate
    ? null
    : "Viewers can't create agents. Ask an owner, admin or member."
  const removeReason = canDelete ? undefined : "Only owners and admins can delete agents."
  const pendingDisplay = agentsPending && !agents

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={headingId} className="text-[22px] font-extrabold tracking-tight">
            Agent permissions
          </h2>
          <p className="max-w-[620px] text-[14.5px] text-muted-foreground">
            {selected
              ? `What ${selected.name} can do on its own, and when it has to ask you first.`
              : `What agents in ${organization.name} can do on their own, and when they have to ask you first.`}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Button
            className="min-h-11 px-4.5 font-bold disabled:border-dashed disabled:border-muted-foreground"
            disabled={!canCreate}
            aria-describedby={createReason ? "create-agent-reason" : undefined}
            onClick={onCreateOpen}
          >
            Create agent
          </Button>
          {createReason ? (
            <span id="create-agent-reason" className="text-sm text-muted-foreground">
              {createReason}
            </span>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p role="alert" className="text-destructive">
          {actionError}
        </p>
      ) : null}

      {canRead && agentsError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-destructive">
          <p>{agentsError}</p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}

      {canRead && pendingDisplay ? (
        <output className="block text-muted-foreground">Loading…</output>
      ) : null}

      {canRead && agents && agents.length === 0 ? (
        <section
          aria-labelledby="no-agents-heading"
          className="flex flex-col items-start gap-3 rounded-lg border-2 border-dashed border-border p-5"
        >
          <h3 id="no-agents-heading" className="font-bold">
            No agents yet
          </h3>
          <p className="max-w-[620px] text-muted-foreground">
            A workspace agent does work for {organization.name} in runs, and waits for you before
            anything leaves the workspace. Create one, then connect the AI client that runs it.
          </p>
          <p className="max-w-[620px] text-muted-foreground">
            To connect a client, create an API key for it, then add the install snippet for that
            client from the agent docs.
          </p>
          <div className="flex flex-wrap gap-2">
            {renderLink({
              href: `/${organization.slug}/settings/api-keys`,
              className: "inline-flex min-h-11 items-center underline underline-offset-3",
              children: "API keys",
            })}
            <a
              href="/llms.txt"
              className="inline-flex min-h-11 items-center underline underline-offset-3"
            >
              Install snippets (llms.txt)
            </a>
          </div>
        </section>
      ) : null}

      {canRead && agents && agents.length > 0 ? (
        <section aria-labelledby="agent-list-heading" className="flex flex-col gap-1">
          <h3 id="agent-list-heading" className="text-base font-bold">
            Agents
          </h3>
          <ul className="flex flex-col">
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                selected={selected?.id === agent.id}
                canUpdate={canUpdate}
                onSelect={() => onSelect(agent.id)}
                onPin={(pinned) => void onUpdate(agent.id, { pinned }).catch(() => undefined)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {canRead && selected ? (
        <section
          aria-labelledby="autonomy-heading"
          className="flex flex-col gap-4 border-t border-border pt-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-bold">
              {selected.name}
              <span className="sr-only"> permissions</span>
            </h3>
            {canUpdate ? (
              <Button variant="outline" className="min-h-11" onClick={onRenameOpen}>
                Edit details
              </Button>
            ) : null}
          </div>
          <PermissionsPanel
            key={selected.id}
            agent={selected}
            canUpdate={canUpdate}
            onSave={(patch) => onUpdate(selected.id, patch)}
          />
        </section>
      ) : null}

      {canRead && selected ? (
        <DangerZone>
          <DangerAction
            label="Delete agent"
            consequence={deleteConsequence(selected.name, canDelete ? runCount : undefined)}
            disabled={!canDelete}
            disabledReason={removeReason}
            onAction={onRemoveOpen}
          />
        </DangerZone>
      ) : null}
    </>
  )
}

function AgentRow({
  agent,
  selected,
  canUpdate,
  onSelect,
  onPin,
}: {
  agent: WorkspaceAgent
  selected: boolean
  canUpdate: boolean
  onSelect: () => void
  onPin: (pinned: boolean) => void
}) {
  const status = ACTIVITY_STATUS[agent.activity]
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-border py-3 sm:flex-nowrap">
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className="flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-md px-1 text-left hover:bg-accent"
      >
        <span className="font-semibold">{agent.name}</span>
        {agent.description ? (
          <span className="text-sm text-muted-foreground">{agent.description}</span>
        ) : null}
      </button>
      <Status state={status.state}>{status.label}</Status>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-sm text-muted-foreground">
          Pinned
        </span>
        <ToggleSwitch
          checked={agent.pinned}
          disabled={!canUpdate}
          label={`Pin ${agent.name} to the sidebar`}
          onChange={onPin}
        />
      </div>
    </li>
  )
}

function PermissionsPanel({
  agent,
  canUpdate,
  onSave,
}: {
  agent: WorkspaceAgent
  canUpdate: boolean
  onSave: (patch: Partial<PermissionSettings>) => Promise<void>
}) {
  const saved = permissionsOf(agent)
  const [draft, setDraft] = useState<PermissionSettings>(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autonomyId = useId()
  const changes = unsavedCopy(saved, draft)
  const patch = changedPermissions(saved, draft)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onSave(patch)
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (canUpdate && changes) void save()
      }}
    >
      <section aria-labelledby={autonomyId} className="flex flex-col gap-2">
        <h4 id={autonomyId} className="text-[15px] font-bold">
          Autonomy
        </h4>
        <fieldset aria-labelledby={autonomyId} className="m-0 min-w-0 border-0 p-0">
          <div className="flex max-w-[520px] overflow-hidden rounded-[10px] border-2 border-foreground">
            {AUTONOMY.map((option, index) => {
              const pressed = draft.autonomy === option
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={pressed}
                  disabled={!canUpdate}
                  onClick={() => setDraft({ ...draft, autonomy: option })}
                  className={`min-h-11 flex-1 px-2 text-[15px] disabled:text-muted-foreground ${
                    index > 0 ? "border-l-2 border-foreground" : ""
                  } ${pressed ? "bg-foreground font-bold text-background" : "font-semibold"}`}
                >
                  {AUTONOMY_LABEL[option]}
                </button>
              )
            })}
          </div>
        </fieldset>
        <p className="text-[13.5px] text-muted-foreground">{AUTONOMY_HINT[draft.autonomy]}</p>
      </section>

      <section aria-label="Actions that always need approval" className="flex flex-col">
        <h4 className="mb-1 text-[15px] font-bold">Actions that always need approval</h4>
        {ALWAYS_ASK.map((item) => (
          <AlwaysAskRow
            key={item.key}
            label={item.label}
            detail={item.detail}
            checked={draft[item.key]}
            disabled={!canUpdate}
            onChange={(next) => setDraft({ ...draft, [item.key]: next })}
          />
        ))}
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <output className="flex-1 text-[13.5px] text-muted-foreground">{changes ?? ""}</output>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 border-2 border-foreground px-4.5 font-bold disabled:border-dashed disabled:border-muted-foreground"
          disabled={!canUpdate || !changes || saving}
          onClick={() => setDraft(saved)}
        >
          Discard
        </Button>
        <Button
          type="submit"
          className="min-h-11 border-2 border-foreground px-4.5 font-bold disabled:border-dashed disabled:border-muted-foreground"
          disabled={!canUpdate || !changes || saving}
        >
          Save changes
        </Button>
        {canUpdate ? null : (
          <p className="basis-full text-sm text-muted-foreground">
            Only owners, admins and members can change these.
          </p>
        )}
      </div>
    </form>
  )
}

function AlwaysAskRow({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string
  detail: string
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center gap-4 border-t border-border py-2.5">
      <div className="flex flex-1 flex-col">
        <span className="font-semibold">{label}</span>
        <span className="text-[13.5px] text-muted-foreground">{detail}</span>
      </div>
      <ToggleSwitch checked={checked} disabled={disabled} label={label} onChange={onChange} />
    </div>
  )
}

/** The board's switch: 48 by 28 inside a 44px target. Dashed when disabled, hatched when off. */
function ToggleSwitch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 min-w-12 shrink-0 items-center justify-center disabled:opacity-100"
    >
      <span
        className={`flex h-7 w-12 items-center rounded-full border-2 p-[3px] ${
          disabled ? "border-dashed border-muted-foreground" : "border-foreground"
        } ${checked ? "justify-end bg-foreground" : "hatch justify-start"}`}
      >
        <span className={`size-4.5 rounded-full ${checked ? "bg-background" : "bg-foreground"}`} />
      </span>
    </button>
  )
}

/** The first validation message for a field (a Zod issue, or a plain string). */
function fieldMessage(errors: unknown[]): string {
  const first = errors[0]
  if (typeof first === "string") return first
  if (first && typeof first === "object" && "message" in first) return String(first.message)
  return "Check this field."
}

function AgentFormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  submitLabel: string
  initial: AgentFormValues
  onSubmit: (values: AgentFormValues) => Promise<void>
}) {
  const nameId = useId()
  const descriptionId = useId()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: initial,
    validators: { onChange: agentFormSchema },
    onSubmit: async ({ value }) => {
      setServerError(null)
      try {
        await onSubmit(agentFormSchema.parse(value))
        form.reset()
      } catch (caught) {
        setServerError(messageOf(caught))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
                  placeholder="Release triage"
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

          <form.Field name="description">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
                <Textarea
                  id={descriptionId}
                  name="description"
                  value={field.state.value}
                  placeholder="What it does"
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                />
                <FieldDescription>Optional.</FieldDescription>
                {field.state.meta.errors.length > 0 ? (
                  <FieldError>{fieldMessage(field.state.meta.errors)}</FieldError>
                ) : null}
              </Field>
            )}
          </form.Field>

          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
