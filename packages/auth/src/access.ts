// The permission catalog and roles, with no server code: the browser client imports this file, so
// it may only import better-auth's access modules. Grant math lives in ./permissions.
import { createAccessControl } from "better-auth/plugins/access"
import { defaultStatements } from "better-auth/plugins/organization/access"

/**
 * The permission catalog: every resource and action in the product. Roles, API keys, OAuth scopes
 * and operations are all expressed in these terms. Add your resources here.
 * The first five come from better-auth's organization plugin; `apiKey` is checked by the api-key plugin.
 */
export const statements = {
  ...defaultStatements,
  // Read lets admins list members with their security state (two-factor, last active).
  member: ["create", "read", "update", "delete"],
  apiKey: ["create", "read", "update", "delete"],
  project: ["create", "read", "update", "delete"],
  // Workspace agents (the configured workers and their settings, not connected AI clients).
  agent: ["create", "read", "update", "delete"],
  // Runs of an agent. `update` is what an agent does while it runs (steps, status, approval
  // requests); `approve` is a person's decision (never granted to a key or an OAuth token);
  // `steer` covers the messages and deferrals a person sends to a run.
  run: ["create", "read", "update", "approve", "steer"],
  // Owner only (see roles): single sign-on providers and SCIM provisioning tokens (mint, list, revoke).
  sso: ["read", "update"],
  scim: ["create", "read", "delete"],
  // Owners and admins (see roles): the organization's subscription and its billing.
  subscription: ["read", "update"],
  // Owner only: turning off another member's two-factor sign-in.
  twoFactor: ["reset"],
} as const

export type Catalog = typeof statements
export const ac = createAccessControl(statements)

const all = Object.fromEntries(
  Object.entries(statements).map(([resource, actions]) => [resource, [...actions]]),
) as { -readonly [R in keyof Catalog]: Catalog[R][number][] }

/** Resources only the owner role holds: the admin role is built without them. */
export const OWNER_ONLY_RESOURCES = ["sso", "scim", "twoFactor"] as const

/** Resources a person holds but no API key may: the owner-only ones, and billing (owner and admin). */
export const PERSON_ONLY_RESOURCES = [...OWNER_ONLY_RESOURCES, "subscription"] as const

/**
 * Actions a person holds but no API key or OAuth token may. Approving a run is a person's decision
 * (the approval is theirs, not an agent's). Keys are refused these in create_api_key, and OAuth
 * scopes never reach them (OAUTH_EXCLUDED in permissions.ts is built from this).
 */
export const PERSON_ONLY_ACTIONS = { run: ["approve"] } as const

const adminStatements = Object.fromEntries(
  Object.entries(all).filter(
    ([resource]) => !(OWNER_ONLY_RESOURCES as readonly string[]).includes(resource),
  ),
) as typeof all

/**
 * Fixed capability roles: the catalog's named bundles of permissions, shipped with the product.
 * A member may hold several ("viewer,approver"), and better-auth grants a request only when one
 * role covers all of it (see rolePermissions). Organizations can't define their own yet: database
 * roles (the organization plugin's dynamicAccessControl) are on the roadmap (docs/roadmap.md).
 */
export const roles = {
  owner: ac.newRole(all),
  admin: ac.newRole({ ...adminStatements, organization: ["update"] }),
  member: ac.newRole({
    ac: ["read"],
    apiKey: ["read"],
    project: ["create", "read", "update"],
    agent: ["create", "read", "update"],
    run: ["create", "read", "update", "approve", "steer"],
  }),
  viewer: ac.newRole({ project: ["read"], agent: ["read"], run: ["read"] }),
  // A reviewer: signs off on runs. Never changes agents or starts runs.
  approver: ac.newRole({ run: ["read", "approve"], project: ["read"], agent: ["read"] }),
  // Runs and steers agents, without deciding approvals or changing their configuration.
  operator: ac.newRole({
    project: ["read"],
    agent: ["read"],
    run: ["create", "read", "update", "steer"],
  }),
  // Finance: the subscription and its billing, without admin rights over members or agents.
  billing: ac.newRole({ subscription: ["read", "update"] }),
} as const

export type RoleName = keyof typeof roles
