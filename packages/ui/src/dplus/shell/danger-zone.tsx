import { cn } from "cn"
import type * as React from "react"
import { useId } from "react"
import { Button } from "../../components/ui/button"

/** A section for actions that cannot be undone. Holds DangerAction rows. */
export function DangerZone({
  title = "Danger zone",
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-4 rounded-lg border-2 border-destructive p-5", className)}
    >
      <h2 id={id} className="text-lg font-bold text-destructive">
        {title}
      </h2>
      {children}
    </section>
  )
}

/**
 * One destructive action: a red outline button and the exact consequence beside it. When it is
 * disabled (e.g. a viewer), the button is dashed and the reason says why.
 */
export function DangerAction({
  label,
  consequence,
  onAction,
  disabled = false,
  disabledReason,
  className,
}: {
  label: string
  /** What is deleted or lost, in full: "Deletes Acme Inc and its 3 agents. This cannot be undone." */
  consequence: string
  onAction: () => void
  disabled?: boolean
  disabledReason?: string
  className?: string
}) {
  const id = useId()
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className,
      )}
    >
      <p id={id} className="max-w-prose text-sm">
        {consequence}
        {disabled && disabledReason && (
          <span className="mt-1 block text-muted-foreground">{disabledReason}</span>
        )}
      </p>
      <Button
        variant="destructive"
        aria-describedby={id}
        disabled={disabled}
        onClick={onAction}
        className="shrink-0"
      >
        {label}
      </Button>
    </div>
  )
}
