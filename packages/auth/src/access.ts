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
  apiKey: ["create", "read", "update", "delete"],
  project: ["create", "read", "update", "delete"],
} as const

export type Catalog = typeof statements
export const ac = createAccessControl(statements)

const all = Object.fromEntries(
  Object.entries(statements).map(([resource, actions]) => [resource, [...actions]]),
) as { -readonly [R in keyof Catalog]: Catalog[R][number][] }

/**
 * Fixed roles. To let organizations define their own, enable the organization plugin's
 * `dynamicAccessControl` and resolve roles through `rolePermissions` in ./permissions.
 */
export const roles = {
  owner: ac.newRole(all),
  admin: ac.newRole({ ...all, organization: ["update"] }),
  member: ac.newRole({
    ac: ["read"],
    apiKey: ["read"],
    project: ["create", "read", "update"],
  }),
  viewer: ac.newRole({ project: ["read"] }),
} as const

export type RoleName = keyof typeof roles
