import type { SCIMProjection } from "@better-auth/scim"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createTestAuth } from "./auth.test.helpers"
import { assertSeatAvailable, seatsTaken } from "./entitlements"
import { type Adapter, findMember } from "./membership"
import { scimProjection } from "./scim-projection"

type Reconcile = NonNullable<SCIMProjection["reconcileUser"]>
type Context = Parameters<Reconcile>[1]

describe("scimProjection (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  let org: string
  let owner: string
  let n = 0

  beforeAll(async () => {
    t = await createTestAuth()
    const signed = await t.signUp("Owner")
    org = signed.orgId
    owner = signed.userId
    // The suite adds more members than Free's 3 seats; the seat check has its own tests.
    await t.onPlan(org, "team")
  })
  afterAll(() => t.close())

  const endAccess = vi.fn(async (_db: Adapter, _userId: string, _organizationId: string) => {})
  const logger = { info: vi.fn(), warn: vi.fn() }

  beforeEach(() => {
    endAccess.mockClear()
    logger.info.mockClear()
    logger.warn.mockClear()
  })

  /** A user whose only SCIM source in the organization is inactive (deprovisioned). */
  const deprovisioned = (userId: string) => ({
    provisioningDomainId: org,
    userId,
    active: false,
    sources: [{ id: `src-${++n}`, connectionId: "conn", provisioningDomainId: org, active: false }],
    grants: [],
  })

  /** A user with an active SCIM source in the organization (provisioned). */
  const provisioned = (userId: string) => ({
    provisioningDomainId: org,
    userId,
    active: true,
    sources: [{ id: `src-${++n}`, connectionId: "conn", provisioningDomainId: org, active: true }],
    grants: [],
  })

  /** The adapter the transaction would hand the projection. */
  async function context(): Promise<Context> {
    const adapter = (await t.auth.$context).adapter
    return { database: adapter as unknown as Context["database"] }
  }

  const adapter = async () => (await t.auth.$context).adapter

  async function reconcile(userId: string) {
    const projection = scimProjection(endAccess, logger)
    await projection.reconcileUser(deprovisioned(userId), await context())
  }

  async function provision(userId: string) {
    const projection = scimProjection(endAccess, logger)
    await projection.reconcileUser(provisioned(userId), await context())
  }

  /** A member the directory provisioned: created by the projection, so source "scim". */
  async function scimMember(name: string) {
    const userId = (await t.signUp(name)).userId
    await provision(userId)
    return userId
  }

  it("keeps the owner's membership, ends nothing, and logs a warning without the email", async () => {
    await reconcile(owner)
    expect((await findMember(await adapter(), owner, org))?.role).toBe("owner")
    expect(endAccess).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
    const [fields] = logger.warn.mock.calls[0] ?? []
    expect(fields).toEqual({ event: "scim.deprovision.owner_kept", userId: owner, orgId: org })
    expect(JSON.stringify(fields)).not.toContain("@")
  })

  it("keeps an owner even when the directory made the membership", async () => {
    const co = (await t.signUp("Co-owner")).userId
    await t.addMember(org, co, "owner,member")
    await provision(co)
    await reconcile(co)
    expect((await findMember(await adapter(), co, org))?.role).toBe("owner,member")
    expect(endAccess).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it("removes a member the directory provisioned and ends their access, without a warning", async () => {
    const alice = await scimMember("Alice")
    expect((await findMember(await adapter(), alice, org))?.role).toBe("member")
    await reconcile(alice)
    expect(await findMember(await adapter(), alice, org)).toBeNull()
    expect(endAccess).toHaveBeenCalledTimes(1)
    expect(endAccess.mock.calls[0]?.slice(1)).toEqual([alice, org])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("keeps a member an owner added by hand, with their access, and logs at info", async () => {
    const hand = (await t.signUp("Hand")).userId
    await t.addMember(org, hand, "member")
    await reconcile(hand)
    expect((await findMember(await adapter(), hand, org))?.role).toBe("member")
    expect(endAccess).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info.mock.calls[0]?.[0]).toEqual({
      event: "scim.deprovision.hand_made_kept",
      userId: hand,
      orgId: org,
    })
  })

  it("keeps a hand-made member the directory also provisions, after their deprovisioning", async () => {
    const invited = (await t.signUp("Invited")).userId
    await t.addMember(org, invited, "member")
    await provision(invited)
    expect((await findMember(await adapter(), invited, org))?.role).toBe("member")
    await reconcile(invited)
    expect(await findMember(await adapter(), invited, org)).not.toBeNull()
    expect(endAccess).not.toHaveBeenCalled()
  })

  it("removes an admin the directory provisioned: admin is not protected, the owner rule is the only one", async () => {
    const admin = await scimMember("Admin")
    const db = await adapter()
    await db.updateMany({
      model: "member",
      where: [{ field: "userId", value: admin }],
      update: { role: "admin" },
    })
    await reconcile(admin)
    expect(await findMember(db, admin, org)).toBeNull()
    expect(endAccess).toHaveBeenCalledTimes(1)
  })

  it("does nothing for a user with an active source in the organization", async () => {
    const active = await scimMember("Active")
    await provision(active)
    expect(await findMember(await adapter(), active, org)).not.toBeNull()
    expect(endAccess).not.toHaveBeenCalled()
  })
})

describe("scimProjection's seat check (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  beforeAll(async () => {
    t = await createTestAuth()
  })
  afterAll(() => t.close())

  it("refuses provisioning a member past the plan's seats, inside the directory's transaction", async () => {
    const { orgId } = await t.signUp("Directory owner")
    for (const name of ["Two", "Three"])
      await t.addMember(orgId, (await t.signUp(name)).userId, "member")
    const projection = scimProjection(
      async () => {},
      { info: () => {}, warn: () => {} },
      async (db, organizationId) =>
        assertSeatAvailable(
          t.auth.entitlements,
          organizationId,
          await seatsTaken(db, organizationId),
        ),
    )
    const newcomer = (await t.signUp("Fourth")).userId
    const database = (await t.auth.$context).adapter as unknown as Context["database"]
    await expect(
      projection.reconcileUser(
        {
          provisioningDomainId: orgId,
          userId: newcomer,
          active: true,
          sources: [
            { id: "src-seat", connectionId: "conn", provisioningDomainId: orgId, active: true },
          ],
          grants: [],
        },
        { database },
      ),
    ).rejects.toMatchObject({ body: { code: "PLAN_LIMIT_REACHED" } })
    expect(await findMember((await t.auth.$context).adapter, newcomer, orgId)).toBeNull()
  })
})
