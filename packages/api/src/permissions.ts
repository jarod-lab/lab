/** `{ resource: [actions] }`, the shape better-auth access control uses. */
export type PermissionSet = Readonly<Record<string, readonly string[]>>

/** Permissions restricted to a catalog: unknown resources or actions are compile errors. */
export type PermissionsOf<C extends PermissionSet> = {
  readonly [R in keyof C]?: readonly C[R][number][]
}

/** Does `have` include every action in `need`? */
export function covers(have: PermissionSet, need: PermissionSet): boolean {
  return Object.entries(need).every(([resource, actions]) =>
    actions.every((a) => have[resource]?.includes(a) ?? false),
  )
}

/** Actions present in both sets. */
export function intersect(a: PermissionSet, b: PermissionSet): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [resource, actions] of Object.entries(a)) {
    const both = actions.filter((x) => b[resource]?.includes(x))
    if (both.length > 0) out[resource] = both
  }
  return out
}

/** Actions present in either set. */
export function union(...sets: PermissionSet[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const set of sets) {
    for (const [resource, actions] of Object.entries(set)) {
      out[resource] = [...new Set([...(out[resource] ?? []), ...actions])]
    }
  }
  return out
}

/**
 * A caller may do something when one grant covers all of it, or when it needs nothing. Callers carry one grant per role
 * (each already narrowed to what the credential allows), matching better-auth's `hasPermission`:
 * a member with roles "a,b" needs a single role that allows the whole request.
 */
export const allowed = (grants: readonly PermissionSet[], need: PermissionSet) =>
  isEmpty(need) || grants.some((g) => covers(g, need))

/** No actions at all: `{}` (or only empty lists). Operations that need nothing are open to any caller. */
export const isEmpty = (p: PermissionSet) => Object.values(p).every((a) => a.length === 0)
