// The organization a caller acts in, as the proof tenant data functions require. Metering, audit and
// idempotency reach org data through this too.
import type { Caller } from "@starter/api"
import {
  type CallerActsFor,
  callerActsFor,
  type Named,
  name,
  OrganizationId,
} from "@starter/auth-proofs"
import { AppError } from "@starter/errors"

/** Run `fn` in the caller's organization, with the proof that tenant data access requires. */
export function inCallerOrg<T>(
  caller: Caller,
  fn: <O>(org: Named<O, OrganizationId>, proof: CallerActsFor<O>) => Promise<T>,
): Promise<T> {
  return name(OrganizationId(caller.organizationId), (org) => {
    const proof = callerActsFor(caller, org)
    if (!proof) throw new AppError("FORBIDDEN", "Not acting for this organization")
    return fn(org, proof)
  })
}
