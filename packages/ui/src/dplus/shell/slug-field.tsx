import { cn } from "cn"
import { useId } from "react"
import { Status, type StatusState } from "../status"

export type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "reserved"

const STATUS: Record<Exclude<SlugStatus, "idle">, { state: StatusState; word: string }> = {
  checking: { state: "running", word: "Checking" },
  available: { state: "done", word: "Available" },
  taken: { state: "failed", word: "Taken" },
  invalid: { state: "needs-you", word: "Use lowercase letters, numbers and hyphens" },
  reserved: { state: "needs-you", word: "That address is reserved. Choose another." },
}

/** A URL slug: fixed prefix, editable part, and a status line that is shape + word. */
export function SlugField({
  label,
  prefix,
  value,
  onChange,
  status,
  name,
  disabled = false,
  className,
}: {
  label: string
  /** Shown before the input, e.g. "app.example.com/". */
  prefix: string
  value: string
  onChange: (value: string) => void
  status: SlugStatus
  name?: string
  /** A viewer's read-only address: dashed, not editable. */
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  const statusId = `${id}-status`
  const bad = status === "taken" || status === "invalid" || status === "reserved"
  const shown = status === "idle" ? undefined : STATUS[status]
  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={id} className="mb-1 text-sm leading-normal font-semibold">
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-11 overflow-hidden rounded-lg border-[1.5px] border-input",
          disabled && "border-dashed border-muted-foreground",
          bad && "border-2 border-destructive",
        )}
      >
        <span className="flex items-center border-r border-border bg-muted px-3 font-mono text-[13.5px] text-muted-foreground">
          {prefix}
        </span>
        <input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          disabled={disabled}
          aria-invalid={bad || undefined}
          aria-describedby={shown ? statusId : undefined}
          autoComplete="off"
          spellCheck={false}
          className="type-mono min-w-0 flex-1 bg-transparent px-3 text-foreground disabled:text-muted-foreground"
        />
      </div>
      <output id={statusId} className="block not-empty:mt-1">
        {shown && (
          <Status state={shown.state} className="text-[13.5px]">
            {shown.word}
          </Status>
        )}
      </output>
    </div>
  )
}
