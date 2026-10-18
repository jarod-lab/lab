import { cn } from "cn"
import type * as React from "react"

/** Run and task states. Each has its own shape, so status never depends on colour alone. */
export type StatusState = "running" | "needs-you" | "done" | "queued" | "failed"

const COLOUR: Record<StatusState, string> = {
  running: "text-foreground",
  "needs-you": "text-foreground",
  done: "text-success",
  queued: "text-muted-foreground",
  failed: "text-destructive",
}

const LABEL: Record<StatusState, string> = {
  running: "Running",
  "needs-you": "Needs you",
  done: "Done",
  queued: "Queued",
  failed: "Failed",
}

/** The bare 16px mark. Decorative: pair it with a word, or use `Status`. */
function StatusIcon({
  state,
  className,
  ...props
}: { state: StatusState } & React.ComponentProps<"svg">) {
  return (
    <svg
      data-slot="status-icon"
      data-state={state}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn(
        "size-4 shrink-0",
        COLOUR[state],
        state === "running" && "motion-safe:animate-[spin_1.2s_linear_infinite]",
        className,
      )}
      {...props}
    >
      {state === "running" && (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
        </>
      )}
      {state === "needs-you" && <circle cx="8" cy="8" r="7" fill="currentColor" />}
      {state === "done" && (
        <path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {state === "queued" && (
        <circle
          cx="8"
          cy="8"
          r="6.25"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.5 2.2"
        />
      )}
      {state === "failed" && (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}

/** Shape + word. `children` replaces the default word ("2 running", "Idle"). */
function Status({
  state,
  className,
  children,
  ...props
}: { state: StatusState } & React.ComponentProps<"span">) {
  return (
    <span
      data-slot="status"
      data-state={state}
      className={cn(
        "inline-flex items-center gap-2 text-sm",
        state === "queued" && "text-muted-foreground",
        state === "failed" && "text-destructive",
        className,
      )}
      {...props}
    >
      <StatusIcon state={state} />
      {children ?? LABEL[state]}
    </span>
  )
}

export { Status, StatusIcon }
