// Idempotency-Key records. Reserve before the handler runs and complete after, so two concurrent
// retries can't both run it. Keys live 24 hours; an expired key is reclaimed by the next reserve.
import type { CallerActsFor, Named, OrganizationId } from "@starter/auth-proofs"
import { type Database, idempotencyKey } from "@starter/db"
import { and, eq, lt } from "drizzle-orm"

const TTL_MS = 24 * 60 * 60 * 1000

export type ReserveResult =
  /** Reserved: run the operation, then complete or release the key. */
  | { state: "new" }
  /** A finished call with this key and request: replay its stored response. */
  | { state: "done"; response: unknown }
  /** Another call with this key is still running (or the reservation is being written). */
  | { state: "in_progress" }
  /** The key was used for a different operation or request body. */
  | { state: "mismatch" }

export async function reserveIdempotencyKey<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  input: { key: string; operation: string; requestHash: string },
): Promise<ReserveResult> {
  const now = new Date()
  const fresh = {
    operation: input.operation,
    requestHash: input.requestHash,
    status: "in_progress",
    response: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + TTL_MS),
  }
  // One statement claims the key when it is new, or when its record has expired.
  const claimed = await db
    .insert(idempotencyKey)
    .values({ id: crypto.randomUUID(), organizationId: org.value, key: input.key, ...fresh })
    .onConflictDoUpdate({
      target: [idempotencyKey.organizationId, idempotencyKey.key],
      set: fresh,
      setWhere: lt(idempotencyKey.expiresAt, now),
    })
    .returning({ id: idempotencyKey.id })
  if (claimed.length > 0) return { state: "new" }

  const [row] = await db
    .select()
    .from(idempotencyKey)
    .where(and(eq(idempotencyKey.organizationId, org.value), eq(idempotencyKey.key, input.key)))
    .limit(1)
  if (!row) return { state: "in_progress" }
  if (row.operation !== input.operation || row.requestHash !== input.requestHash) {
    return { state: "mismatch" }
  }
  if (row.status === "done") return { state: "done", response: row.response }
  return { state: "in_progress" }
}

export async function completeIdempotencyKey<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  input: { key: string; response: unknown },
): Promise<void> {
  await db
    .update(idempotencyKey)
    .set({ status: "done", response: input.response })
    .where(and(eq(idempotencyKey.organizationId, org.value), eq(idempotencyKey.key, input.key)))
}

/** Drop a reservation whose handler failed, so a retry can run. Completed keys are kept. */
export async function releaseIdempotencyKey<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  key: string,
): Promise<void> {
  await db
    .delete(idempotencyKey)
    .where(
      and(
        eq(idempotencyKey.organizationId, org.value),
        eq(idempotencyKey.key, key),
        eq(idempotencyKey.status, "in_progress"),
      ),
    )
}
