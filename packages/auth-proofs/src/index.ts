// Authorization proofs via gdp-ts (https://github.com/rauchg/gdp-ts).
// Proof types live in `proofs/` (the only place allowed to mint them); functions that touch tenant
// data take proofs as arguments. See the gdp-ts skill.
export { name, type Named } from "@gdp-ts/core"
export { OrganizationId, ProjectId } from "./lib/ids"
export { type CallerActsFor, callerActsFor } from "./proofs/caller-acts-for"
export { type ProjectInOrg, projectInOrg } from "./proofs/project-in-org"
