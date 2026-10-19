import type { SCIMProjection } from "@better-auth/scim"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { type Adapter, findMember } from "./membership"
import { createTestAuth } from "./auth.test.helpers"
import { scimProjection } from "./scim-projection"

type Reconcile = NonNullable<SCIMProjection["reconcileUser"]>
type Context = Parameters<Reconcile>[1]

describe("scimProjection deprovisioning (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  let org: string
  let owner: string
  let alice: string
  let n = 0

  beforeAll(async () => {
    t = await createTestAuth()
    const signed = await t.signUp("Owner")
    org = signed.orgId
    owner = signed.userId
    alice = (await t.signUp("Alice")).userId
  })
  afterAll(() => t.close())

  const endAccess = vi.fn(async (_db: Adapter, _userId: string, _organizationId: string) => {})
  const logger = { warn: vi.fn() }

  beforeEach(() => {
    endAccess.mockClear()
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

  /** The adapter the transaction would hand the projection. */
  async function context(): Promise<Context> {
    const adapter = (await t.auth.$context).adapter
    return { database: adapter as unknown as Context["database"] }
  }

  async function reconcile(userId: string) {
    const projection = scimProjection(endAccess, logger)
    await projection.reconcileUser(deprovisioned(userId), await context())
  }

  it("keeps the owner's membership, ends nothing, and logs a warning without the email", async () => {
    await reconcile(owner)
    expect((await findMember((await t.auth.$context).adapter, owner, org))?.role).toBe("owner")
    expect(endAccess).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
    const [fields] = logger.warn.mock.calls[0] ?? []
    expect(fields).toEqual({ event: "scim.deprovision.owner_kept", userId: owner, orgId: org })
    expect(JSON.stringify(fields)).not.toContain("@")
  })

  it("keeps a member whose role is comma-separated and includes owner", async () => {
    const co = (await t.signUp("Co-owner")).userId
    await t.addMember(org, co, "owner,member")
    await reconcile(co)
    expect((await findMember((await t.auth.$context).adapter, co, org))?.role).toBe("owner,member")
    expect(endAccess).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it("removes a plain member and ends their access, without a warning", async () => {
    await t.addMember(org, alice, "member")
    await reconcile(alice)
    expect(await findMember((await t.auth.$context).adapter, alice, org)).toBeNull()
    expect(endAccess).toHaveBeenCalledTimes(1)
    expect(endAccess.mock.calls[0]?.slice(1)).toEqual([alice, org])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("removes an admin: admin is not protected, the owner rule is the only one", async () => {
    const admin = (await t.signUp("Admin")).userId
    await t.addMember(org, admin, "admin")
    await reconcile(admin)
    expect(await findMember((await t.auth.$context).adapter, admin, org)).toBeNull()
    expect(endAccess).toHaveBeenCalledTimes(1)
  })

  it("does nothing for a user with an active source in the organization", async () => {
    const active = (await t.signUp("Active")).userId
    await t.addMember(org, active, "member")
    const projection = scimProjection(endAccess, logger)
    await projection.reconcileUser(
      {
        provisioningDomainId: org,
        userId: active,
        active: true,
        sources: [{ id: "s", connectionId: "c", provisioningDomainId: org, active: true }],
        grants: [],
      },
      await context(),
    )
    expect(await findMember((await t.auth.$context).adapter, active, org)).not.toBeNull()
    expect(endAccess).not.toHaveBeenCalled()
  })
})
