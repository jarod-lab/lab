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

/**
 * The current query exactly as the browser has it. Use this, not the router's `searchStr`, to carry
 * a signed OAuth query to another page: the router re-serialises search (repeated keys collapse and
 * `+` becomes `%20`), which breaks the signature.
 */
export function rawSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}

/** Full-page navigation: the next page is served by the API, so it must load from the server. */
export function navigateTo(url: string): void {
  window.location.assign(url)
}
