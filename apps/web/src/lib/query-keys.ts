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
    /** The organization's own settings (name, slug, metadata) as the server returns them. */
    settings: () => [...base, "settings"] as const,
    /** Live counts shown in the danger zone (API keys, ...). */
    counts: () => [...base, "counts"] as const,
    members: () => [...base, "members"] as const,
    /** Members with two-factor state and last activity; under members, so a change refreshes both. */
    membersSecurity: () => [...base, "members", "security"] as const,
    invitations: () => [...base, "invitations"] as const,
    apiKeys: () => [...base, "api-keys"] as const,
    agents: () => [...base, "agents"] as const,
    /** The number of workspace agents, under the agents prefix. */
    agentsCount: () => [...base, "agents", "count"] as const,
    /** Every run in this org, and the single-run keys below it. */
    runs: () => [...base, "runs"] as const,
    run: (runId: string) => [...base, "runs", requireId("run id", runId)] as const,
  }
}

export const qk = {
  session: () => ["session"] as const,
  organizations: () => ["organizations"] as const,
  /** Whether a slug is free, while someone types it on the create-organization page. */
  organizationSlugAvailable: (slug: string) => ["organization-slug-available", slug] as const,
  /** Whether this server stores uploads, and what an image may be (get_upload_limits). */
  uploadLimits: () => ["upload-limits"] as const,
  account: {
    all: () => ["account"] as const,
    sessions: () => ["account", "sessions"] as const,
    passkeys: () => ["account", "passkeys"] as const,
  },
  org,
}
