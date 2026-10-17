// Pure helpers for the account pages: copy derived from server data. No network, no React.

/** The sign-in providers the account page offers to connect. Whether the server has one set up is
 *  only known when a connect is attempted (PROVIDER_NOT_FOUND); see account-api.ts. */
export const SOCIAL_PROVIDERS = [
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
] as const

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]["id"]

/** Two letters for the avatar: the first letter of the first and last word of the name. */
export function initialsOf(name: string, email = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return (email.trim()[0] ?? "?").toUpperCase()
  const first = words[0] ?? ""
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : ""
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** "2 days ago", "yesterday", "just now". Empty when there is no date. */
export function relativeTime(value: string | Date | null | undefined, now = Date.now()): string {
  if (!value) return ""
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return ""
  // Never future: a browser clock behind the server must not say "in 5 minutes" for a past time.
  const diff = Math.min(time - now, 0)
  if (Math.abs(diff) < 60_000) return "just now"
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return relative.format(Math.round(diff / size), unit)
  }
  return relative.format(Math.round(diff / 60_000), "minute")
}

/** "Sep 2, 2026". Empty when there is no date. */
export function dateLabel(value: string | Date | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })
}

/** The browser and operating system from a User-Agent string, in words: "Chrome on macOS". */
export function deviceLabel(userAgent: string | null | undefined): string {
  const agent = userAgent ?? ""
  // Edge (Android, iOS too), Chrome and Firefox on iOS carry their own token; Safari is the fallback.
  const browser = /Edg(?:A|iOS)?\//.test(agent)
    ? "Edge"
    : /OPR\/|Opera/.test(agent)
      ? "Opera"
      : /Firefox\/|FxiOS\//.test(agent)
        ? "Firefox"
        : /Chrome\/|Chromium\/|CriOS\//.test(agent)
          ? "Chrome"
          : /Safari\//.test(agent)
            ? "Safari"
            : null
  const system = /iPhone/.test(agent)
    ? "iPhone"
    : /iPad/.test(agent)
      ? "iPad"
      : /Android/.test(agent)
        ? "Android"
        : /Windows/.test(agent)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(agent)
            ? "macOS"
            : /CrOS/.test(agent)
              ? "ChromeOS"
              : /Linux/.test(agent)
                ? "Linux"
                : null
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? "Unknown device"
}

const METHOD_LABEL: Record<string, string> = {
  email: "email and password",
  passkey: "passkey",
  "magic-link": "email link",
  github: "GitHub",
  google: "Google",
  sso: "single sign-on",
}

/**
 * How a session was signed in, as the security page words it: "passkey", "email, password and
 * two-factor". Null when the session predates the record.
 */
export function signInMethodLabel(
  loginMethod: string | null | undefined,
  loginTwoFactor: boolean,
): string | null {
  if (!loginMethod) return null
  const label = METHOD_LABEL[loginMethod] ?? loginMethod
  if (!loginTwoFactor) return label
  return loginMethod === "email" ? "email, password and two-factor" : `${label} and two-factor`
}

/** Whether a stored role string ("admin,member") includes the owner role. */
export function isOwnerRole(role: string): boolean {
  return role
    .split(",")
    .map((part) => part.trim())
    .includes("owner")
}

/** The personal organization's slug for a user, as the server names it (membership.ts). */
export function personalSlugOf(userId: string): string {
  return `personal-${userId.toLowerCase()}`
}
