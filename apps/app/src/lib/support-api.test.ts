import { describe, expect, it, vi } from "vitest"

import { fakeSupportClient } from "../test/fake-support"
import type { OrgMember } from "./org-settings-api"
import { SUPPORT_STAFF, createSupportApi } from "./support-api"

const member = (userId: string, role: string, extra: Partial<OrgMember> = {}): OrgMember => ({
  id: `m-${userId}`,
  userId,
  role,
  name: userId.toUpperCase(),
  email: `${userId}@example.com`,
  ...extra,
})

// The catalog's answer, as roleAllows gives it: owners, admins and members hold support:read.
const roleAllows = vi.fn((role: string) =>
  role.split(",").some((part) => ["owner", "admin", "member"].includes(part)),
)

function api(
  members: OrgMember[] = [],
  overrides: { memberRole?: () => Promise<string>; support?: unknown } = {},
) {
  const listMembers = vi.fn(async (_organizationId: string, limit?: number) => ({
    total: members.length,
    members: members.slice(0, limit ?? 2),
  }))
  const auth = {
    memberRole: vi.fn(overrides.memberRole ?? (async () => "member")),
    support: "support" in overrides ? overrides.support : fakeSupportClient(),
  } as Parameters<typeof createSupportApi>[0]
  return { listMembers, api: createSupportApi(auth, { listMembers, roleAllows }) }
}

describe("createSupportApi", () => {
  it("calls someone staff when their staff organization role holds support:read", async () => {
    expect(await api().api.isStaff("org-op")).toBe(true)
    expect(roleAllows).toHaveBeenLastCalledWith("member", SUPPORT_STAFF)
    expect(await api([], { memberRole: async () => "viewer" }).api.isStaff("org-op")).toBe(false)
  })

  it("calls someone outside the staff organization not staff", async () => {
    const outside = api([], {
      memberRole: async () => {
        throw new Error("not a member")
      },
    })
    expect(await outside.api.isStaff("org-op")).toBe(false)
  })

  it("lists only members whose role makes them staff, past the first page too", async () => {
    const { api: support, listMembers } = api([
      member("ada", "owner", { image: "https://img.example.com/ada.png" }),
      member("bob", "viewer"),
      member("cy", "admin,member", { name: "" }),
    ])
    expect(await support.listStaff("org-op")).toEqual([
      { id: "ada", name: "ADA", image: "https://img.example.com/ada.png" },
      // No name: the address stands in.
      { id: "cy", name: "cy@example.com", image: null },
    ])
    expect(listMembers).toHaveBeenNthCalledWith(1, "org-op")
    expect(listMembers).toHaveBeenNthCalledWith(2, "org-op", 3)
  })

  it("asks support whether the session may work the queue", async () => {
    expect(await api().api.queueAccess()).toBe("staff")
    const refused = (status: number) => {
      const client = fakeSupportClient()
      client.support.agent.tags.mockResolvedValue({ data: null, error: { status } } as never)
      return api([], { support: client }).api.queueAccess()
    }
    expect(await refused(401)).toBe("signed-out")
    expect(await refused(403)).toBe("not-staff")
    await expect(refused(500)).rejects.toThrow("Could not check your support access")
    expect(await api([], { support: undefined }).api.queueAccess()).toBe("not-staff")
  })
})
