// Query keys for the account pages (profile, security). Everything here is per person, not per
// organization, so it sits under the `account` prefix that `qk.account.all()` clears on sign-out.
// Kept apart from query-keys.ts so the settings pages can change without touching these.

export const accountKeys = {
  all: () => ["account"] as const,
  profile: () => ["account", "profile"] as const,
  accounts: () => ["account", "linked-accounts"] as const,
  signInMethods: () => ["account", "sign-in-methods"] as const,
  passkeys: () => ["account", "passkeys"] as const,
  sessions: () => ["account", "sessions"] as const,
  securitySummary: () => ["account", "security-summary"] as const,
}
