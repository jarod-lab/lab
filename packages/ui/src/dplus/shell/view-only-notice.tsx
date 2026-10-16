import { cn } from "cn"
import { EyeIcon } from "lucide-react"
import type * as React from "react"

/** Tells a viewer why they cannot change something. Dashed, with an eye: not an error. */
export function ViewOnlyNotice({
  subject,
  children,
  className,
}: {
  /** What they can see, e.g. "Acme Inc" or "this agent". */
  subject: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-label="View-only access"
      className={cn(
        "flex items-start gap-3 rounded-lg border-2 border-dashed border-muted-foreground p-3.5 text-sm",
        className,
      )}
    >
      <EyeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="flex flex-col gap-1">
        <span>You have view-only access to {subject}.</span>
        {children && <span className="text-muted-foreground">{children}</span>}
      </p>
    </section>
  )
}
