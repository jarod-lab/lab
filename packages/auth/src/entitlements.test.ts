import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createTestAuth } from "./auth.test.helpers"
import {
  acceptEntitlementsSession,
  organizationClaimed,
  seatsTaken,
  takesNewSeat,
} from "./entitlements"

const session = (impersonatedBy: string | null = null) => ({
  session: { id: "s1", userId: "u1", impersonatedBy },
  user: { id: "u1", email: "u1@example.com" },
})

describe("acceptEntitlementsSession", () => {
  const accept = (
    input: Partial<Parameters<typeof acceptEntitlementsSession>[0]> & { headers?: Headers },
  ) =>
    acceptEntitlementsSession({
      session: session(),
      headers: new Headers(),
      kind: "member",
      method: "GET",
      path: "/entitlements/get",
      ...input,
    })

  it("lets a member read, and an impersonated session read its own organization", () => {
    expect(accept({})).toBe(true)
    expect(accept({ session: session("admin-1") })).toBe(true)
  })

  it("refuses an impersonated session on a staff call and on any POST (the package's rule)", () => {
    expect(accept({ session: session("admin-1"), kind: "staff" })).toBe(false)
    expect(
      accept({ session: session("admin-1"), method: "POST", path: "/entitlements/refresh" }),
    ).toBe(false)
  })

  it("takes only a cookie session on the staff endpoints", () => {
    const key = new Headers({ "x-api-key": "sk_x" })
    const bearer = new Headers({ authorization: "Bearer token" })
    for (const headers of [key, bearer]) {
      expect(
        accept({ headers, kind: "staff", method: "POST", path: "/entitlements/override/set" }),
      ).toBe(false)
      expect(accept({ headers, kind: "staff", path: "/entitlements/overrides" })).toBe(false)
      // A member's own read with a key beside the cookie is the read it would get anyway.
      expect(accept({ headers })).toBe(true)
    }
  })
})

describe("hasFeature (README setup step 5)", () => {
  it("answers Free's missing feature with the plan that has it, without throwing", async () => {
    const t = await createTestAuth()
    try {
      const { orgId } = await t.signUp("Gate")
      expect(await t.auth.entitlements.hasFeature(orgId, "sso")).toEqual({
        allowed: false,
        reason: "not_in_plan",
        key: "sso",
        plan: "free",
        upgradeTo: ["team"],
      })
      expect((await t.auth.entitlements.hasFeature(orgId, "apiKeys")).allowed).toBe(true)
    } finally {
      await t.close()
    }
  })
})

describe("takesNewSeat", () => {
  it("is a change from free (viewer only) to a role that takes a seat", () => {
    expect(takesNewSeat("viewer", "member")).toBe(true)
    expect(takesNewSeat("viewer", "viewer,approver")).toBe(true)
    expect(takesNewSeat("member", "admin")).toBe(false)
    expect(takesNewSeat("admin", "viewer")).toBe(false)
  })
})

describe("seats and claims (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  beforeAll(async () => {
    t = await createTestAuth()
  })
  afterAll(() => t.close())

  it("counts every member but viewers, and pending invitations when asked", async () => {
    const owner = await t.signUp("Owner")
    await t.addMember(owner.orgId, (await t.signUp("Viewer")).userId, "viewer")
    await t.addMember(owner.orgId, (await t.signUp("Member")).userId, "member")
    const db = (await t.auth.$context).adapter
    await db.create({
      model: "invitation",
      data: {
        organizationId: owner.orgId,
        email: "pending@example.com",
        role: "member",
        status: "pending",
        inviterId: owner.userId,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
      },
    })
    // An expired invitation is still "pending" in the table, but holds no seat.
    await db.create({
      model: "invitation",
      data: {
        organizationId: owner.orgId,
        email: "expired@example.com",
        role: "member",
        status: "pending",
        inviterId: owner.userId,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(),
      },
    })
    expect(await seatsTaken(db, owner.orgId)).toBe(2)
    expect(await seatsTaken(db, owner.orgId, { invitations: true })).toBe(3)
  })

  it("is claimed once an owner's email is verified", async () => {
    const owner = await t.signUp("Claimer")
    const db = (await t.auth.$context).adapter
    expect(await organizationClaimed(db, owner.orgId)).toBe(false)
    await db.updateMany({
      model: "user",
      where: [{ field: "id", value: owner.userId }],
      update: { emailVerified: true },
    })
    expect(await organizationClaimed(db, owner.orgId)).toBe(true)
    expect(await organizationClaimed(db, "no-such-org")).toBe(false)
  })

  it("lowers the request limit while unclaimed, and lifts it when the claim is verified", async () => {
    const owner = await t.signUp("Provisional")
    expect((await t.auth.entitlements.getLimit(owner.orgId, "requests")).limit).toBe(500)
    // The verify-email path: a user update with emailVerified clears the cached plan.
    const ctx = await t.auth.$context
    await ctx.internalAdapter.updateUser(owner.userId, { emailVerified: true })
    expect((await t.auth.entitlements.getLimit(owner.orgId, "requests")).limit).toBe(10_000)
  })

  it("gives each plan its own request cap once claimed, and keeps the lower one until then", async () => {
    const ctx = await t.auth.$context
    const cases = [
      ["free", 10_000],
      ["pro", 100_000],
      ["team", "unlimited"],
    ] as const
    for (const [plan, cap] of cases) {
      const owner = await t.signUp(`Plan ${plan}`)
      await t.onPlan(owner.orgId, plan)
      // Unclaimed: the lower limit on every plan, Team's unlimited included.
      expect((await t.auth.entitlements.getLimit(owner.orgId, "requests")).limit).toBe(500)
      await ctx.internalAdapter.updateUser(owner.userId, { emailVerified: true })
      expect((await t.auth.entitlements.getLimit(owner.orgId, "requests")).limit).toBe(cap)
    }
  })
})
