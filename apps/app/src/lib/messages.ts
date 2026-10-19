/** The text to show for a failed call. Server messages are already written for people. */
export function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message
    ? caught.message
    : "Something went wrong. Try again."
}

/** The message for a field's Zod issues (TanStack Form's `field.state.meta.errors`). */
export function fieldMessage(errors: unknown[]): string {
  const first = errors[0]
  if (typeof first === "string") return first
  if (first && typeof first === "object" && "message" in first) return String(first.message)
  return "Check this field."
}
