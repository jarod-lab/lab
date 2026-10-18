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
import type { Database } from "@starter/db"
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

/**
 * The proof that row `id` exists in `org`, from the prover for its kind (`projectInOrg`, `runInOrg`,
 * ...), or NOT_FOUND. A missing row and another organization's row get the same answer, so
 * existence doesn't leak across tenants. The result is the prover's own proof type.
 */
export async function requireInOrg<T extends string, X, O, P>(
  prove: (db: Database, id: Named<X, T>, org: Named<O, OrganizationId>) => Promise<P | null>,
  db: Database,
  id: Named<X, T>,
  org: Named<O, OrganizationId>,
  label: string,
): Promise<P> {
  const proof = await prove(db, id, org)
  if (!proof) throw new AppError("NOT_FOUND", `${label} not found`)
  return proof
}

/**
 * What a data function returned after its proof was obtained: NOT_FOUND if it came back empty (the
 * row vanished between the two queries). Same falsy test as the `if (!row) throw` it replaces.
 */
export function orNotFound<T>(found: T, label: string): NonNullable<T> {
  if (!found) throw new AppError("NOT_FOUND", `${label} not found`)
  return found
}
