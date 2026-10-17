/**
 * A suffix for the names, emails and slugs a journey creates. The journeys run in parallel (and on
 * two targets), so the time alone can repeat: two that start in the same millisecond would sign up
 * the same email. Lowercase letters and digits, so it fits a slug.
 */
export const uniqueId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
