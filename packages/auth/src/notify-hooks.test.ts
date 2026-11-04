// Notices from better-auth's own events (notify-hooks.ts). These call auth.api in-process, which runs
// the same hooks as HTTP; apps/api/src/auth-flows.test.ts covers the same events over the wire.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createTestAuth } from "./auth.test.helpers"
import { notificationHooks } from "./notify-hooks"

describe("auth events send notices to the right people", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  beforeAll(async () => {
    t = await createTestAuth()
  })
  afterAll(() => t.close())

  /** The person's inbox, as their own session reads it. */
  const inboxOf = async (cookie: string) =>
    (await t.auth.api.listNotifications({ headers: new Headers({ cookie }) })).notifications

  /** A team: an owner (the session's personal organization), an admin and a plain member. */
  async function team() {
    const owner = await t.signUp("Owner")
    const admin = await t.signUp("Admin")
    const member = await t.signUp("Member")
    const adminMember = await t.addMember(owner.orgId, admin.userId, "admin")
    const memberMember = await t.addMember(owner.orgId, member.userId, "member")
    return { owner, admin, member, adminId: adminMember.id, memberId: memberMember.id }
  }

  it("tells a removed member, but not someone who removed themselves", async () => {
    const { owner, admin, member, adminId, memberId } = await team()
    await t.auth.api.removeMember({
      headers: new Headers({ cookie: owner.cookie }),
      body: { memberIdOrEmail: memberId, organizationId: owner.orgId },
    })
    expect((await inboxOf(member.cookie)).map((n) => n.type)).toEqual(["member.removed"])
    expect((await inboxOf(owner.cookie)).filter((n) => n.type === "member.removed")).toEqual([])

    await t.setActive(admin.cookie, owner.orgId)
    await t.auth.api.removeMember({
      headers: new Headers({ cookie: admin.cookie }),
      body: { memberIdOrEmail: adminId, organizationId: owner.orgId },
    })
    expect((await inboxOf(admin.cookie)).filter((n) => n.type === "member.removed")).toEqual([])
  })

  it("tells a member their new role, not the owner who changed it", async () => {
    const { owner, member, memberId } = await team()
    await t.auth.api.updateMemberRole({
      headers: new Headers({ cookie: owner.cookie }),
      body: { memberId, role: "admin", organizationId: owner.orgId },
    })
    expect((await inboxOf(member.cookie)).map((n) => n.type)).toEqual(["member.role_changed"])
    expect((await inboxOf(owner.cookie)).filter((n) => n.type === "member.role_changed")).toEqual(
      [],
    )
  })

  it("tells the managers of an API key created or deleted, not the person who did it", async () => {
    const { owner, admin, member } = await team()
    const created = await t.auth.api.createApiKey({
      body: {
        organizationId: owner.orgId,
        userId: owner.userId,
        name: "CI bot",
        permissions: { project: ["read"] },
      },
    })
    const toAdmin = (await inboxOf(admin.cookie)).filter((n) => n.type === "api_key.created")
    expect(toAdmin).toEqual([expect.objectContaining({ organizationId: owner.orgId })])
    expect((await inboxOf(owner.cookie)).filter((n) => n.type.startsWith("api_key"))).toEqual([])
    expect((await inboxOf(member.cookie)).filter((n) => n.type.startsWith("api_key"))).toEqual([])

    await t.auth.api.deleteApiKey({
      headers: new Headers({ cookie: owner.cookie }),
      body: { keyId: created.id },
    })
    expect((await inboxOf(admin.cookie)).filter((n) => n.type === "api_key.revoked")).toEqual([
      expect.objectContaining({ organizationId: owner.orgId, title: "API key revoked" }),
    ])
    expect((await inboxOf(owner.cookie)).filter((n) => n.type.startsWith("api_key"))).toEqual([])
  })

  it("deleting an organization takes its notices with it", async () => {
    const { owner, member, memberId } = await team()
    await t.auth.api.updateMemberRole({
      headers: new Headers({ cookie: owner.cookie }),
      body: { memberId, role: "admin", organizationId: owner.orgId },
    })
    expect((await inboxOf(member.cookie)).map((n) => n.type)).toEqual(["member.role_changed"])
    await t.auth.api.deleteOrganization({
      headers: new Headers({ cookie: owner.cookie }),
      body: { organizationId: owner.orgId },
    })
    expect(await inboxOf(member.cookie)).toEqual([])
  })

  it("a member who leaves keeps no notices for the organization", async () => {
    const { owner, member, memberId } = await team()
    await t.auth.api.updateMemberRole({
      headers: new Headers({ cookie: owner.cookie }),
      body: { memberId, role: "admin", organizationId: owner.orgId },
    })
    expect((await inboxOf(member.cookie)).length).toBe(1)
    await t.setActive(member.cookie, owner.orgId)
    await t.auth.api.leaveOrganization({
      headers: new Headers({ cookie: member.cookie }),
      body: { organizationId: owner.orgId },
    })
    expect(await inboxOf(member.cookie)).toEqual([])
  })

  it("tells the person whose password changed, and reports a notice that fails without failing the change", async () => {
    const onNotificationError = vi.fn()
    const local = await createTestAuth({ onNotificationError })
    try {
      const person = await local.signUp("Changer")
      const changed = await local.auth.api.changePassword({
        headers: new Headers({ cookie: person.cookie }),
        body: { currentPassword: "correct-horse-battery", newPassword: "a-new-passphrase" },
      })
      expect(changed.token === null || typeof changed.token === "string").toBe(true)
      const inbox = await local.auth.api.listNotifications({
        headers: new Headers({ cookie: person.cookie }),
      })
      expect(inbox.notifications.map((n) => n.type)).toEqual(["account.password_changed"])

      const spy = vi.spyOn(local.auth.api, "notify").mockRejectedValueOnce(new Error("inbox down"))
      await local.auth.api.changePassword({
        headers: new Headers({ cookie: person.cookie }),
        body: { currentPassword: "a-new-passphrase", newPassword: "another-passphrase" },
      })
      expect(spy).toHaveBeenCalledOnce()
      expect(onNotificationError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "inbox down" }),
        "account.password_changed",
      )
      spy.mockRestore()
    } finally {
      await local.close()
    }
  })
})

describe("a notifier that throws", () => {
  it("a personal notice reports the failure instead of failing the caller", async () => {
    const onError = vi.fn()
    const hooks = notificationHooks({
      notifier: {
        send: async () => {
          throw new Error("notifier down")
        },
      },
      adapter: async () => {
        throw new Error("no adapter needed for a personal notice")
      },
      onError,
    })
    await expect(
      hooks.personal({ type: "account.email_changed", userId: "user_a" }),
    ).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "notifier down" }),
      "account.email_changed",
    )
  })
})
