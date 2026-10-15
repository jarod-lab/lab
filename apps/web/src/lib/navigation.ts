const DEFAULT_LANDING = "/settings/agents"

/**
 * A `next` value that is safe to redirect to: a path on this origin. Anything else (absolute URLs,
 * protocol-relative `//host`, backslash tricks) falls back to the landing page.
 */
export function safeNext(value: unknown, fallback = DEFAULT_LANDING): string {
  if (typeof value !== "string") return fallback
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback
  return value
}

/** Full-page navigation: the next page is served by the API, so it must load from the server. */
export function navigateTo(url: string): void {
  window.location.assign(url)
}
