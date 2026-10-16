import { cn } from "cn"
import type * as React from "react"

/**
 * A count shown as cells: used ones solid ink, the rest hatched ("not used yet"). For seats, run
 * budgets and other small whole-number quotas; use Progress for percentages.
 */
function Meter({
  value,
  max,
  label,
  cell = "square",
  className,
  ...props
}: {
  value: number
  max: number
  /** Accessible name, e.g. "12 of 15 seats used". */
  label: string
  /** `square` 14px cells (budgets), `tall` 12×18 cells (seats). */
  cell?: "square" | "tall"
} & Omit<React.ComponentProps<"div">, "children">) {
  const total = Math.max(0, Math.floor(max))
  const used = Math.min(total, Math.max(0, Math.floor(value)))
  return (
    <div data-slot="meter" className={cn("flex flex-wrap gap-0.75", className)} {...props}>
      {/* The cells are the picture; a native meter carries the value for assistive tech. */}
      <meter className="sr-only" min={0} max={total} value={used} aria-label={label} />
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional and never reorder
          key={i}
          aria-hidden="true"
          data-slot="meter-cell"
          data-used={i < used ? "" : undefined}
          className={cn(
            "rounded-[3px] border border-border",
            cell === "square" ? "size-3.5" : "h-4.5 w-3",
            i < used ? "border-foreground bg-foreground" : "hatch",
          )}
        />
      ))}
    </div>
  )
}

export { Meter }
