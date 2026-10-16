import { cn } from "cn"

// D+ "running" mark: a ring with a filled half that turns. It is the only thing in the UI that
// moves, and it stops under prefers-reduced-motion (the shape alone still reads as running).
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0 motion-safe:animate-[spin_2.4s_linear_infinite]", className)}
      {...props}
    >
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
    </svg>
  )
}

export { Spinner }
