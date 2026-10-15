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
import { getUsage, incrementUsage } from "./usage"

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

describe("usage metering", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>
  beforeEach(async () => {
    t = await createTestDb()
    for (const id of ["org_a", "org_b"]) {
      await t.db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() })
    }
  })
  afterEach(() => t.close())

  it("counts per operation and day, and returns the day's total across operations", async () => {
    const inc = (op: string, day: string) =>
      acting("org_a", (org, proof) => incrementUsage(t.db, org, proof, op, day))

    expect(await inc("list_projects", "2026-10-15")).toBe(1)
    expect(await inc("list_projects", "2026-10-15")).toBe(2)
    expect(await inc("create_project", "2026-10-15")).toBe(3)
    // Another day starts from zero.
    expect(await inc("list_projects", "2026-10-16")).toBe(1)

    const usage = await acting("org_a", (org, proof) => getUsage(t.db, org, proof, "2026-10-15"))
    expect(usage).toEqual({
      total: 3,
      byOperation: { list_projects: 2, create_project: 1 },
    })
  })

  it("reports zero for a day with no calls, and ignores other organizations", async () => {
    await acting("org_b", (org, proof) =>
      incrementUsage(t.db, org, proof, "list_projects", "2026-10-15"),
    )

    const usage = await acting("org_a", (org, proof) => getUsage(t.db, org, proof, "2026-10-15"))
    expect(usage).toEqual({ total: 0, byOperation: {} })
  })
})
