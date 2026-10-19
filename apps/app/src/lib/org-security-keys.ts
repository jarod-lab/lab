import { qk } from "./query-keys"

// Query keys for the organization's Security page. The provider list sits under the organization's own
// prefix, so invalidating the org refreshes it. The SCIM token is never cached: it lives in React state.

export const orgSecurityKeys = {
  /** The SSO providers this organization has registered (owner only). */
  providers: (organizationId: string) =>
    [...qk.org(organizationId).all(), "sso-providers"] as const,
}
