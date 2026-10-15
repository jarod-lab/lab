import type { Caller } from "@starter/api"
import {
  type CallerActsFor,
  callerActsFor,
  name,
  type Named,
  OrganizationId,
} from "@starter/auth-proofs"
import { idempotencyKey, organization } from "@starter/db"
import { createTestDb } from "@starter/db/testing"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { completeIdempotencyKey, releaseIdempotencyKey, reserveIdempotencyKey } from "./idempotency"

const caller = (organizationId: string): Caller => ({
  organizationId,
  actor: { type: "user", userId: "user_1" },
  grants: [],
  via: "session",
})

function acting<R>(
  orgId: string,
  fn: <O>(org: Named<O, OrganizationId>, proof: CallerActsFor<O>) => Promise<R>,
): Promise<R> {
  return name(OrganizationId(orgId), async (org) => {
    const proof = callerActsFor(caller(orgId), org)
    if (!proof) throw new Error("caller does not act for the organization")
    return fn(org, proof)
  })
}

describe("idempotency keys", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>
  beforeEach(async () => {
    t = await createTestDb()
    for (const id of ["org_a", "org_b"]) {
      await t.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() })
    }
  })
  afterEach(() => t.close())

  const reserve = (
    key: string,
    operation = "create_project",
    requestHash = "hash-1",
    org = "org_a",
  ) =>
    acting(org, (o, proof) =>
      reserveIdempotencyKey(t.db, o, proof, { key, operation, requestHash }),
    )

  it("runs once: a retry while in progress waits, and after completion replays the response", async () => {
    expect(await reserve("k1")).toEqual({ state: "new" })
    // A concurrent retry sees the reservation, so the handler can't run twice.
    expect(await reserve("k1")).toEqual({ state: "in_progress" })

    await acting("org_a", (o, proof) =>
      completeIdempotencyKey(t.db, o, proof, { key: "k1", response: { id: "p1" } }),
    )
    expect(await reserve("k1")).toEqual({ state: "done", response: { id: "p1" } })
  })

  it("refuses a key reused with a different request body or operation", async () => {
    await reserve("k2", "create_project", "hash-1")
    expect(await reserve("k2", "create_project", "hash-2")).toEqual({ state: "mismatch" })
    expect(await reserve("k2", "delete_project", "hash-1")).toEqual({ state: "mismatch" })
  })

  it("lets a retry run again after the failed attempt released its key", async () => {
    await reserve("k3")
    await acting("org_a", (o, proof) => releaseIdempotencyKey(t.db, o, proof, "k3"))
    expect(await reserve("k3")).toEqual({ state: "new" })
  })

  it("keeps a completed key on release", async () => {
    await reserve("k4")
    await acting("org_a", (o, proof) =>
      completeIdempotencyKey(t.db, o, proof, { key: "k4", response: { ok: true } }),
    )
    await acting("org_a", (o, proof) => releaseIdempotencyKey(t.db, o, proof, "k4"))
    expect(await reserve("k4")).toEqual({ state: "done", response: { ok: true } })
  })

  it("reclaims an expired key", async () => {
    await reserve("k5", "create_project", "old")
    await t.db
      .update(idempotencyKey)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(idempotencyKey.key, "k5"))
    expect(await reserve("k5", "create_project", "new")).toEqual({ state: "new" })
  })

  it("keeps keys per organization", async () => {
    await reserve("k6", "create_project", "hash-1", "org_a")
    expect(await reserve("k6", "create_project", "hash-1", "org_b")).toEqual({ state: "new" })
  })
})
