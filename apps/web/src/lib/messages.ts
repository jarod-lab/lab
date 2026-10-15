/** The text to show for a failed call. Server messages are already written for people. */
export function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message
    ? caught.message
    : "Something went wrong. Try again."
}
