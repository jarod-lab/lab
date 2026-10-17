import { useForm } from "@tanstack/react-form"
import { useEffect, useId, useState } from "react"

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
import { Meter } from "@starter/ui/dplus/meter"
import { Status } from "@starter/ui/dplus/status"

import { messageOf } from "../lib/messages"
import { serverNowMs } from "../lib/server-clock"
import {
  decisionCopy,
  deferSchema,
  deferIso,
  footprintCells,
  footprintCopy,
  formatWhen,
  RUN_STATUS_STATE,
  secondsCopy,
  secondsLeft,
  steerSchema,
  type DeferValues,
  type SteerValues,
} from "../lib/run-view"
import type { Approval, RunDetail, RunMessage, RunStep, StepStatus } from "../lib/runs-api"
import { useNow } from "../lib/use-now"

function fieldMessage(issues: unknown[]): string {
  const first = issues[0]
  if (typeof first === "string") return first
  if (first && typeof first === "object" && "message" in first) return String(first.message)
  return "Check this field."
}

/** The step's status word: its progress when it runs, or the time it took when it ended. */
function stepMeta(step: RunStep): string | null {
  if (step.status === "running" && step.progressTotal !== null) {
    return `${step.progressDone ?? 0} of ${step.progressTotal}`
  }
  if (step.status === "queued") return "Queued"
  if (step.durationMs !== null) return `${Math.max(1, Math.round(step.durationMs / 1000))}s`
  return null
}

export function StepTimeline({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No steps yet. The agent lists its steps here as it works.
      </p>
    )
  }
  return (
    <ol aria-label="Run steps" className="flex flex-1 flex-col border-t border-border">
      {steps.map((step) => {
        const state = stepState(step.status)
        const meta = stepMeta(step)
        return (
          <li
            key={step.id}
            className="flex flex-col gap-2 border-b border-border py-2.5"
            data-status={step.status}
          >
            <div className="flex items-center gap-3">
              <Status state={state} className="min-w-0 flex-1 text-base">
                <span
                  className={step.status === "queued" ? "text-muted-foreground" : "text-foreground"}
                >
                  {step.title}
                </span>
              </Status>
              {meta ? (
                <span className="shrink-0 text-[13px] text-muted-foreground">{meta}</span>
              ) : null}
            </div>
            {step.status === "running" && step.progressTotal !== null ? (
              <div
                aria-hidden="true"
                className="ml-7 h-2.5 overflow-hidden rounded-[3px] border border-border hatch"
              >
                <div
                  className="h-full bg-foreground"
                  style={{
                    width: `${Math.min(100, Math.round(((step.progressDone ?? 0) / Math.max(1, step.progressTotal)) * 100))}%`,
                  }}
                />
              </div>
            ) : null}
            {step.detail ? (
              <p className="ml-7 text-sm text-muted-foreground">{step.detail}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function stepState(status: StepStatus) {
  return RUN_STATUS_STATE[status]
}

/** The step counter at the top right: "4/6", from the first step that is not done. */
export function StepCounter({ index, total }: { index: number; total: number }) {
  return (
    <div
      aria-label={`Step ${index} of ${total}`}
      className="font-extrabold leading-[.8] tracking-tighter text-[64px]"
    >
      {index}
      <span className="text-4xl text-muted-foreground">/{total}</span>
    </div>
  )
}

export interface ApprovalCardProps {
  approval: Approval
  canApprove: boolean
  /** The signed-in person's user id, so their own decision reads "You approved." */
  viewerId?: string
  busy: boolean
  onDecide: (approvalId: string, decision: "approve" | "deny") => void
  onUndo: (approvalId: string) => void
  /** Called once the undo window has passed, so the page reloads the final decision. */
  onWindowPassed: () => void
}

/**
 * The approval card: the exact action, the content it would send, and the decision. Pending approvals
 * are the solar "needs you" card; after a decision, the undo window counts down from the server's end
 * time. Approve and Deny carry equal weight.
 */
export function ApprovalCard({
  approval,
  canApprove,
  viewerId,
  busy,
  onDecide,
  onUndo,
  onWindowPassed,
}: ApprovalCardProps) {
  const headingId = useId()
  const undoUntil = approval.decision?.undoableUntil ?? null
  const decided = approval.status !== "pending"

  if (decided && undoUntil === null) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-2 rounded-[14px] border-2 border-border p-4"
      >
        <h2 id={headingId} className="text-lg font-bold">
          {approval.action}
        </h2>
        <p className="text-sm text-muted-foreground">
          {decisionCopy(approval.status, approval.decision, viewerId)} The decision is final.
        </p>
      </section>
    )
  }

  if (decided && undoUntil !== null) {
    return (
      <UndoWindow
        approval={approval}
        headingId={headingId}
        untilIso={undoUntil}
        canApprove={canApprove}
        viewerId={viewerId}
        busy={busy}
        onUndo={onUndo}
        onWindowPassed={onWindowPassed}
      />
    )
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-[14px] bg-solar p-5 text-solar-foreground"
    >
      <span className="text-[12.5px] font-extrabold tracking-wider">● NEEDS YOUR APPROVAL</span>
      <h2 id={headingId} className="font-extrabold leading-tight text-[25px] tracking-tight">
        {approval.action}
      </h2>
      {approval.detail ? (
        <blockquote className="rounded-lg bg-solar-foreground/10 p-3 text-[14.5px] leading-relaxed">
          {approval.detail}
        </blockquote>
      ) : null}
      {canApprove ? (
        <>
          <div className="flex flex-wrap gap-2">
            <ApprovalButton
              label="Approve"
              disabled={busy}
              onClick={() => onDecide(approval.id, "approve")}
            />
            <ApprovalButton
              label="Deny"
              disabled={busy}
              onClick={() => onDecide(approval.id, "deny")}
            />
          </div>
          <span className="text-[13px]">Undo available for 30 seconds after you choose.</span>
        </>
      ) : (
        <p className="text-[13px]">
          Only people who can approve can decide this. You can read it, but not answer it.
        </p>
      )}
    </section>
  )
}

/** One button shape for both decisions, so neither reads as the default. */
function ApprovalButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 flex-1 rounded-lg border-2 border-solar-foreground bg-solar-foreground px-4 font-bold text-solar disabled:border-dashed disabled:bg-transparent disabled:text-solar-foreground disabled:opacity-60"
    >
      {label}
    </button>
  )
}

function UndoWindow({
  approval,
  headingId,
  untilIso,
  canApprove,
  viewerId,
  busy,
  onUndo,
  onWindowPassed,
}: {
  approval: Approval
  headingId: string
  untilIso: string
  canApprove: boolean
  viewerId?: string
  busy: boolean
  onUndo: (approvalId: string) => void
  onWindowPassed: () => void
}) {
  const now = useNow(1000)
  const seconds = secondsLeft(untilIso, serverNowMs(now))
  const open = seconds > 0
  useEffect(() => {
    if (!open) onWindowPassed()
  }, [open, onWindowPassed])

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-[14px] bg-solar p-5 text-solar-foreground"
    >
      <span className="text-[12.5px] font-extrabold tracking-wider">● DECIDED</span>
      <h2 id={headingId} className="font-extrabold leading-tight text-[22px] tracking-tight">
        {approval.action}
      </h2>
      <p className="text-[15px]">
        {decisionCopy(approval.status, approval.decision, viewerId)}{" "}
        {open ? (
          <output aria-live="off">Undo available for {secondsCopy(seconds)}.</output>
        ) : (
          "The decision is now final."
        )}
      </p>
      {open && canApprove ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onUndo(approval.id)}
          className="min-h-11 self-start border-2 border-solar-foreground bg-transparent text-solar-foreground hover:bg-solar-foreground/10"
        >
          Undo
        </Button>
      ) : null}
    </section>
  )
}

export function Footprint({
  footprint,
  energyBudgetWh,
}: {
  footprint: RunDetail["footprint"]
  energyBudgetWh: number | null
}) {
  const cells = footprintCells(footprint.energyWh, energyBudgetWh)
  return (
    <div className="flex flex-wrap items-center gap-3.5 rounded-[10px] border border-border px-3.5 py-2.5">
      <span className="text-[13.5px] font-semibold">Run footprint</span>
      <Meter value={cells.value} max={cells.max} label={footprintCopy(footprint, energyBudgetWh)} />
      <span className="min-w-[12rem] flex-1 text-[13.5px] text-muted-foreground">
        {footprintCopy(footprint, energyBudgetWh)}
      </span>
    </div>
  )
}

export function MessageList({ messages }: { messages: RunMessage[] }) {
  if (messages.length === 0) return null
  return (
    <section aria-labelledby="run-messages" className="flex flex-col gap-2">
      <h2 id="run-messages" className="text-sm font-semibold text-muted-foreground">
        Your messages to the agent
      </h2>
      <ul className="flex flex-col gap-2">
        {messages.map((message) => (
          <li key={message.id} className="rounded-lg border border-border px-3.5 py-2.5 text-sm">
            <p>{message.body}</p>
            <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
              {formatWhen(message.createdAt)}
            </time>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The steer and defer controls at the foot of the run. Both are off once the run has finished. */
export function SteerBar({
  disabledReason,
  busy,
  deferredUntil,
  onSteer,
  onDefer,
}: {
  disabledReason: string | null
  busy: boolean
  deferredUntil: string | null
  onSteer: (body: string) => Promise<void>
  onDefer: (untilIso: string) => Promise<void>
}) {
  const inputId = useId()
  const [deferOpen, setDeferOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const disabled = disabledReason !== null

  const form = useForm({
    defaultValues: { body: "" } as SteerValues,
    validators: { onChange: steerSchema },
    onSubmit: async ({ value }) => {
      setServerError(null)
      try {
        await onSteer(value.body.trim())
        form.reset()
      } catch (caught) {
        setServerError(messageOf(caught))
      }
    },
  })

  return (
    <div className="flex flex-col gap-2">
      {disabledReason ? <p className="text-sm text-muted-foreground">{disabledReason}</p> : null}
      <form
        noValidate
        aria-label="Steer this run"
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <form.Field name="body">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={inputId} className="sr-only">
                Steer this run
              </FieldLabel>
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  id={inputId}
                  name="body"
                  disabled={disabled}
                  value={field.state.value}
                  placeholder="Steer this run: add context, change the plan, or ask why"
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  className="min-h-12 flex-1 rounded-[10px] border-[1.5px] px-4"
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled || busy}
                    onClick={() => setDeferOpen(true)}
                    className="min-h-12 flex-1 rounded-[10px] border-2 border-foreground md:flex-none"
                  >
                    Defer
                  </Button>
                  <Button
                    type="submit"
                    disabled={disabled || busy}
                    className="min-h-12 flex-1 rounded-[10px] border-2 border-foreground md:flex-none"
                  >
                    Send
                  </Button>
                </div>
              </div>
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
      </form>
      {deferredUntil ? (
        <Status state="queued">Queued until {formatWhen(deferredUntil)}</Status>
      ) : null}
      <DeferDialog
        open={deferOpen}
        onOpenChange={setDeferOpen}
        onSubmit={async (untilIso) => {
          await onDefer(untilIso)
          setDeferOpen(false)
        }}
      />
    </div>
  )
}

function DeferDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (untilIso: string) => Promise<void>
}) {
  const inputId = useId()
  const [serverError, setServerError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { until: "" } as DeferValues,
    validators: { onChange: deferSchema },
    onSubmit: async ({ value }) => {
      setServerError(null)
      try {
        await onSubmit(deferIso(value.until))
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
          <DialogTitle>Defer this run</DialogTitle>
          <DialogDescription>
            The run waits as queued and starts again at the time you choose. Pick a time in the
            future.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
        >
          <form.Field name="until">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={inputId}>Start again at</FieldLabel>
                <Input
                  id={inputId}
                  name="until"
                  type="datetime-local"
                  value={field.state.value}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  className="min-h-11"
                  onChange={(event) => field.handleChange(event.currentTarget.value)}
                  onBlur={field.handleBlur}
                />
                <FieldDescription>Your local time.</FieldDescription>
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
            <Button type="submit" className="min-h-11">
              Defer run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
