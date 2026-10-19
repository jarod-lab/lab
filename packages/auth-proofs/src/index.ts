// Authorization proofs via gdp-ts (https://github.com/rauchg/gdp-ts).
// Proof types live in `proofs/` (the only place allowed to mint them); functions that touch tenant
// data take proofs as arguments. See the gdp-ts skill.
export { name, type Named } from "@gdp-ts/core"
export {
  AgentId,
  ApprovalId,
  FeatureFlagKey,
  OrganizationId,
  ProjectId,
  RunId,
  UserId,
} from "./lib/ids"
export { type CallerActsFor, callerActsFor } from "./proofs/caller-acts-for"
export { type ProjectInOrg, projectInOrg } from "./proofs/project-in-org"
export { type AgentInOrg, agentInOrg } from "./proofs/agent-in-org"
export { type RunInOrg, runInOrg } from "./proofs/run-in-org"
export { type ApprovalInOrg, approvalInOrg } from "./proofs/approval-in-org"
export { type MemberInOrg, memberInOrg } from "./proofs/member-in-org"
export { type OperatorOrg, operatorOrg } from "./proofs/operator-org"
export { type FlagInOrg, flagInOrg } from "./proofs/flag-in-org"
