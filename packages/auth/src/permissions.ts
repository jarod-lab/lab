import { intersect, type PermissionSet, type PermissionsOf, union } from "@starter/api"
import { type Catalog, type RoleName, roles } from "./access"

export {
  ac,
  type Catalog,
  OWNER_ONLY_RESOURCES,
  PERSON_ONLY_RESOURCES,
  type RoleName,
  roles,
  statements,
} from "./access"

export type Permissions = PermissionsOf<Catalog>

/**
 * One permission set per role in a member's role string ("admin,member" -> two sets), kept apart
 * because better-auth grants a request only when a single role allows all of it. Unknown roles grant
 * nothing.
 */
export function rolePermissions(role: string): PermissionSet[] {
  return role
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is RoleName => r in roles)
    .map((r) => roles[r].statements as PermissionSet)
}

/**
 * Coarse OAuth scopes shown on the consent screen. A token may do what one of the user's roles allows
 * AND what its scopes allow. Defined explicitly; never derived from action names.
 */
export const OAUTH_SCOPE_GRANTS = {
  read: { project: ["read"], apiKey: ["read"], agent: ["read"], run: ["read"] },
  write: {
    project: ["create", "read", "update", "delete"],
    apiKey: ["read"],
    agent: ["create", "read", "update", "delete"],
    run: ["create", "read", "update", "steer"],
  },
  admin: {
    organization: ["update"],
    member: ["create", "read", "update", "delete"],
    invitation: ["create", "cancel"],
    apiKey: ["create", "read", "update", "delete"],
  },
} as const satisfies Record<string, Permissions>

export type OAuthScope = keyof typeof OAUTH_SCOPE_GRANTS
export const OAUTH_SCOPES = Object.keys(OAUTH_SCOPE_GRANTS) as OAuthScope[]

/**
 * What an impersonated session (an admin acting as the user, see guards.ts) may do through the API:
 * reads only. Narrows whatever the member's roles allow, so no key can be created while impersonating.
 */
export const IMPERSONATION_GRANTS = {
  project: ["read"],
  apiKey: ["read"],
  agent: ["read"],
  run: ["read"],
  member: ["read"],
} as const satisfies Permissions

/** Actions no OAuth token can ever get: an agent should not delete orgs or edit roles. */
export const OAUTH_EXCLUDED: Permissions = {
  organization: ["delete"],
  ac: ["create", "read", "update", "delete"],
  team: ["create", "update", "delete"],
  // Owner-only: an agent never sets up SSO, mints SCIM tokens or changes the subscription.
  sso: ["read", "update"],
  scim: ["create"],
  subscription: ["read", "update"],
  // An agent never decides an approval (a person does, in the web app) and never resets 2FA.
  run: ["approve"],
  twoFactor: ["reset"],
}

/** What a set of granted OAuth scopes allows (unknown scopes such as `openid` allow nothing). */
export function scopePermissions(scopes: readonly string[]): PermissionSet {
  return union(
    ...scopes
      .filter((s): s is OAuthScope => s in OAUTH_SCOPE_GRANTS)
      .map((s) => OAUTH_SCOPE_GRANTS[s] as PermissionSet),
  )
}

/** Narrow each role's permissions to what a credential allows. Empty grants are dropped. */
export function narrow(grants: PermissionSet[], credential: PermissionSet): PermissionSet[] {
  return grants.map((g) => intersect(g, credential)).filter((g) => Object.keys(g).length > 0)
}
