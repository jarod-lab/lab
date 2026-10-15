const PLAIN_SCOPES: Record<string, string> = {
  openid: "Confirm who you are",
  profile: "See your name",
  email: "See your email address",
  offline_access: "Stay connected without signing in again",
  read: "Read data in the organization",
  write: "Create and change data in the organization",
  admin: "Manage the organization: members, API keys and connected agents",
}

/** A scope in plain words for a person deciding whether to allow it. */
export function describeScope(scope: string): string {
  return PLAIN_SCOPES[scope] ?? `Use the "${scope}" permission`
}

/** The space-separated `scope` parameter, as a list with no empty entries. */
export function splitScopes(scope: string | undefined): string[] {
  return (scope ?? "").split(" ").filter((s) => s.length > 0)
}
