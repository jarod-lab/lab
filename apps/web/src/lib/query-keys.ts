// Query keys for TanStack Query. Everything that belongs to an organization sits under `org(orgId)`,
// so two tabs on two organizations never share a cache entry, and invalidating one org's data is a
// prefix match on `["org", orgId]`. Account-level data (the session, the organizations list, the
// user's own sessions and passkeys) is not org-scoped.

function requireId(name: string, id: string): string {
  if (id.length === 0) throw new Error(`query key: ${name} is empty`)
  return id
}

const org = (orgId: string) => {
  const base = ["org", requireId("organization id", orgId)] as const
  return {
    /** Every query for this organization. Invalidate this to refresh the whole org. */
    all: () => base,
    /** The caller's own role in this organization (a membership, not org data). */
    role: () => [...base, "role"] as const,
    members: () => [...base, "members"] as const,
    invitations: () => [...base, "invitations"] as const,
    apiKeys: () => [...base, "api-keys"] as const,
    agents: () => [...base, "agents"] as const,
    /** Every run in this org, and the single-run keys below it. */
    runs: () => [...base, "runs"] as const,
    run: (runId: string) => [...base, "runs", requireId("run id", runId)] as const,
  }
}

export const qk = {
  session: () => ["session"] as const,
  organizations: () => ["organizations"] as const,
  account: {
    all: () => ["account"] as const,
    sessions: () => ["account", "sessions"] as const,
    passkeys: () => ["account", "passkeys"] as const,
  },
  org,
}
