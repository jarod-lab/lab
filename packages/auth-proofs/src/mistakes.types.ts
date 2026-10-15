// Type-checked, never run: each line is a mistake the compiler must reject. If one stops being an
// error, `pnpm typecheck` fails on the unused @ts-expect-error. Add the mistake you almost made.
import type { Named } from "@gdp-ts/core"
import type { OrganizationId, ProjectId } from "./lib/ids"
import type { CallerActsFor } from "./proofs/caller-acts-for"
import type { ProjectInOrg } from "./proofs/project-in-org"

declare function listFor<O>(org: Named<O, OrganizationId>, _p: CallerActsFor<O>): void
declare function deleteIn<P, O>(
  id: Named<P, ProjectId>,
  org: Named<O, OrganizationId>,
  _p: { inOrg: ProjectInOrg<P, O>; actor: CallerActsFor<O> },
): void

declare const orgA: Named<"A", OrganizationId>
declare const orgB: Named<"B", OrganizationId>
declare const proj: Named<"P", ProjectId>
declare const actsForA: CallerActsFor<"A">
declare const actsForB: CallerActsFor<"B">
declare const projInA: ProjectInOrg<"P", "A">

export function mistakes() {
  // @ts-expect-error: a raw string is not a named organization id
  listFor("org-a", actsForA)
  // @ts-expect-error: a proof about organization B doesn't unlock organization A
  listFor(orgA, actsForB)
  // @ts-expect-error: a project id is not an organization id
  listFor(proj, actsForA)
  // @ts-expect-error: proving the project is in A doesn't let a caller acting for B delete it
  deleteIn(proj, orgB, { inOrg: projInA, actor: actsForB })
  // @ts-expect-error: deleting needs the project-in-org proof, not only the caller's
  deleteIn(proj, orgA, { actor: actsForA })
  deleteIn(proj, orgA, { inOrg: projInA, actor: actsForA }) // the honest call compiles
}
