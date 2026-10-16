// Type-checked, never run: each line is a mistake the compiler must reject. If one stops being an
// error, `pnpm typecheck` fails on the unused @ts-expect-error. Add the mistake you almost made.
import type { Named } from "@gdp-ts/core"
import type { AgentId, ApprovalId, OrganizationId, ProjectId, RunId, UserId } from "./lib/ids"
import type { AgentInOrg } from "./proofs/agent-in-org"
import type { ApprovalInOrg } from "./proofs/approval-in-org"
import type { CallerActsFor } from "./proofs/caller-acts-for"
import type { MemberInOrg } from "./proofs/member-in-org"
import type { ProjectInOrg } from "./proofs/project-in-org"
import type { RunInOrg } from "./proofs/run-in-org"

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
declare function startRunIn<A, O>(
  agentId: Named<A, AgentId>,
  org: Named<O, OrganizationId>,
  _p: { inOrg: AgentInOrg<A, O>; actor: CallerActsFor<O> },
): void
declare function decideIn<X, O>(
  id: Named<X, ApprovalId>,
  org: Named<O, OrganizationId>,
  _p: { inOrg: ApprovalInOrg<X, O>; actor: CallerActsFor<O> },
): void
declare function resetTwoFactorIn<U, O>(
  user: Named<U, UserId>,
  org: Named<O, OrganizationId>,
  _p: { member: MemberInOrg<U, O>; actor: CallerActsFor<O> },
): void
declare function steerIn<R, O>(
  run: Named<R, RunId>,
  org: Named<O, OrganizationId>,
  _p: { inOrg: RunInOrg<R, O>; actor: CallerActsFor<O> },
): void
declare const agentA: Named<"AG", AgentId>
declare const agentInA: AgentInOrg<"AG", "A">
declare const approvalA: Named<"AP", ApprovalId>
declare const approvalInA: ApprovalInOrg<"AP", "A">
declare const runA: Named<"R", RunId>
declare const runInA: RunInOrg<"R", "A">
declare const userA: Named<"U", UserId>
declare const memberInA: MemberInOrg<"U", "A">

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
  // @ts-expect-error: an agent proof about organization A doesn't start a run in organization B
  startRunIn(agentA, orgB, { inOrg: agentInA, actor: actsForB })
  // @ts-expect-error: starting a run needs the agent-in-org proof, not only the caller's
  startRunIn(agentA, orgA, { actor: actsForA })
  // @ts-expect-error: a run proof doesn't decide an approval: the proof's kind is RunInOrg
  decideIn(approvalA, orgA, { inOrg: runInA, actor: actsForA })
  // @ts-expect-error: a member proof about organization A doesn't reset 2FA in organization B
  resetTwoFactorIn(userA, orgB, { member: memberInA, actor: actsForB })
  // @ts-expect-error: steering a run in B needs B's run proof, not A's
  steerIn(runA, orgB, { inOrg: runInA, actor: actsForB })
  // The honest calls compile.
  startRunIn(agentA, orgA, { inOrg: agentInA, actor: actsForA })
  decideIn(approvalA, orgA, { inOrg: approvalInA, actor: actsForA })
  resetTwoFactorIn(userA, orgA, { member: memberInA, actor: actsForA })
  steerIn(runA, orgA, { inOrg: runInA, actor: actsForA })
}
