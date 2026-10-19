const DEFAULT_LANDING = "/settings/agents"

/**
 * A `next` value that is safe to redirect to: a path on this origin. Anything else (absolute URLs,
 * protocol-relative `//host`, backslash tricks, tabs or newlines the URL parser strips) falls back to
 * the landing page. The check resolves the value the way the browser will and compares origins.
 */
export function safeNext(value: unknown, fallback = DEFAULT_LANDING): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback
  const base = "https://origin.invalid"
  try {
    return new URL(value, base).origin === base ? value : fallback
  } catch {
    return fallback // e.g. "//[": an unparseable host
  }
}

/**
 * The current query exactly as the browser has it. Use this, not the router's `searchStr`, to carry
 * a signed OAuth query to another page: the router re-serialises search (repeated keys collapse and
 * `+` becomes `%20`), which breaks the signature.
 */
export function rawSearch(): string {
  return typeof window === "undefined" ? "" : window.location.search
}

const assignLocation = (url: string) => window.location.assign(url)
let navigator: (url: string) => void = assignLocation

/** Full-page navigation: the next page is served by the API, so it must load from the server. */
export function navigateTo(url: string): void {
  navigator(url)
}

/**
 * Replaces how `navigateTo` leaves the page; undefined restores `window.location.assign`. jsdom can't
 * load another page, so tests record the URL instead.
 */
export function setNavigator(next: ((url: string) => void) | undefined): void {
  navigator = next ?? assignLocation
}
