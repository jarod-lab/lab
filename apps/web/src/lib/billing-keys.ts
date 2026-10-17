import { qk } from "./query-keys"

// Query keys for the billing page. The snapshot sits under the organization's own prefix, so
// invalidating the org (`qk.org(id).all()`) refreshes billing too. The adapter choice is per
// browser session, not per organization.

export const billingKeys = {
  /** The adapter the server's flag selected (fixture or stripe). */
  mode: () => ["billing", "mode"] as const,
  /** One organization's billing snapshot. */
  snapshot: (organizationId: string) => [...qk.org(organizationId).all(), "billing"] as const,
  /** Today's metered requests for one organization (under the snapshot's prefix). */
  usage: (organizationId: string) => [...qk.org(organizationId).all(), "billing", "usage"] as const,
}
