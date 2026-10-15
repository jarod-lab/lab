import type { Caller } from "@starter/api"
import {
  type CallerActsFor,
  callerActsFor,
  name,
  type Named,
  OrganizationId,
} from "@starter/auth-proofs"
import { organization } from "@starter/db"
import { createTestDb } from "@starter/db/testing"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { listAuditEvents, recordAuditEvent } from "./audit"

const caller = (organizationId: string): Caller => ({
  organizationId,
  actor: { type: "user", userId: "user_1" },
  grants: [],
  via: "session",
})

/** Run `fn` with the org's name and a proof that the caller acts for it. */
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

describe("audit events", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>
  beforeEach(async () => {
    t = await createTestDb()
    for (const id of ["org_a", "org_b"]) {
      await t.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() })
    }
  })
  afterEach(() => t.close())

  const event = (operation: string, outcome: "ok" | "FORBIDDEN" = "ok") => ({
    actorType: "apiKey" as const,
    actorId: "key_1",
    clientId: "client_1",
    operation,
    outcome,
    requestId: `req-${operation}`,
  })

  it("lists the organization's events newest first, paginated without repeats", async () => {
    await acting("org_a", (org, proof) =>
      recordAuditEvent(t.db, org, proof, event("create_project")),
    )
    await acting("org_a", (org, proof) =>
      recordAuditEvent(t.db, org, proof, event("delete_project")),
    )
    await acting("org_a", (org, proof) =>
      recordAuditEvent(t.db, org, proof, event("create_api_key", "FORBIDDEN")),
    )

    const first = await acting("org_a", (org, proof) =>
      listAuditEvents(t.db, org, proof, { limit: 2 }),
    )
    expect(first).toHaveLength(2)
    expect(first.map((e) => e.operation)).toEqual(["create_api_key", "delete_project"])
    expect(first[0]).toMatchObject({
      actorType: "apiKey",
      actorId: "key_1",
      clientId: "client_1",
      outcome: "FORBIDDEN",
      requestId: "req-create_api_key",
    })

    const last = first[1]
    if (!last) throw new Error("expected a second event")
    const second = await acting("org_a", (org, proof) =>
      listAuditEvents(t.db, org, proof, {
        limit: 2,
        after: { at: last.at.toISOString(), id: last.id },
      }),
    )
    expect(second.map((e) => e.operation)).toEqual(["create_project"])
  })

  it("never returns another organization's events", async () => {
    await acting("org_b", (org, proof) =>
      recordAuditEvent(t.db, org, proof, event("create_project")),
    )

    const seen = await acting("org_a", (org, proof) =>
      listAuditEvents(t.db, org, proof, { limit: 50 }),
    )
    expect(seen).toEqual([])
  })

  it("only mints a proof for the organization the caller acts for", () => {
    name(OrganizationId("org_a"), (org) => {
      expect(callerActsFor(caller("org_b"), org)).toBeNull()
      expect(callerActsFor(caller("org_a"), org)).not.toBeNull()
    })
  })
})
