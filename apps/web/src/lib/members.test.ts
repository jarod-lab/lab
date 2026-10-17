import { describe, expect, it } from "vitest"

// The catalog's own roles (not a copy): the matrix must agree with what the server enforces.
import { roles } from "../../../../packages/auth/src/access"
import {
  type Allows,
  type MatrixRole,
  PERMISSION_MATRIX,
  canChangeRole,
  canRemoveMember,
  canResetTwoFactor,
  expiryCopy,
  initialsOf,
  invitationState,
  lastActiveCopy,
  parseInviteEmails,
  permissionMatrix,
  removeConsequence,
  roleLabelOf,
  sentCopy,
  topRoleOf,
} from "./members"

// Each role as the catalog states it, through better-auth's own authorize (the check checkRolePermission wraps).
const catalogAllows = (role: MatrixRole, permission: Record<string, string[]>) =>
  roles[role].authorize(permission as never).success

const allowsFor =
  (role: string): Allows =>
  (permission) =>
    role.split(",").some((part) => catalogAllows(part.trim() as MatrixRole, permission))

describe("permissionMatrix", () => {
  const matrix = permissionMatrix(catalogAllows)
  const row = (label: string) => matrix.find((r) => r.label === label)

  it("has one row per board label, each with a cell per role", () => {
    expect(matrix.map((r) => r.label)).toEqual(PERMISSION_MATRIX.map((r) => r.label))
    for (const r of matrix)
      expect(Object.keys(r.cells).sort()).toEqual(["admin", "member", "owner", "viewer"])
  })

  it("matches the catalog: owner does everything, viewer only reads", () => {
    for (const r of matrix) expect(r.cells.owner, r.label).toBe(true)
    expect(row("See agents, runs, settings")?.cells).toEqual({
      owner: true,
      admin: true,
      member: true,
      viewer: true,
    })
    expect(row("Start runs, approve actions")?.cells.viewer).toBe(false)
    expect(row("Invite and manage members")?.cells).toEqual({
      owner: true,
      admin: true,
      member: false,
      viewer: false,
    })
  })

  it("keeps billing and org deletion owner-only, as the catalog does", () => {
    expect(row("Billing")?.cells).toEqual({
      owner: true,
      admin: false,
      member: false,
      viewer: false,
    })
    expect(row("Delete or transfer the org")?.cells.admin).toBe(false)
  })
})

describe("who can change what", () => {
  const admin = allowsFor("admin")
  const member = allowsFor("member")

  it("never offers the role menu on an owner row, or on yourself", () => {
    expect(canChangeRole({ isSelf: false, role: "owner" }, admin)).toBe(false)
    expect(canChangeRole({ isSelf: true, role: "admin" }, admin)).toBe(false)
    expect(canChangeRole({ isSelf: false, role: "member" }, admin)).toBe(true)
  })

  it("needs member:update for the role menu and member:delete for remove", () => {
    expect(canChangeRole({ isSelf: false, role: "member" }, member)).toBe(false)
    expect(canRemoveMember({ isSelf: false, role: "member" }, admin)).toBe(true)
    expect(canRemoveMember({ isSelf: false, role: "member" }, member)).toBe(false)
    expect(canRemoveMember({ isSelf: false, role: "owner" }, admin)).toBe(false)
  })

  it("resets two-factor only for another person who has it on, and only for owners", () => {
    const owner = allowsFor("owner")
    expect(
      canResetTwoFactor({ isSelf: false, role: "member", twoFactorEnabled: true }, owner),
    ).toBe(true)
    expect(
      canResetTwoFactor({ isSelf: false, role: "member", twoFactorEnabled: false }, owner),
    ).toBe(false)
    expect(
      canResetTwoFactor({ isSelf: false, role: "member", twoFactorEnabled: true }, admin),
    ).toBe(false)
    expect(canResetTwoFactor({ isSelf: true, role: "owner", twoFactorEnabled: true }, owner)).toBe(
      false,
    )
  })

  it("states the consequence of removing a member exactly", () => {
    expect(removeConsequence("Ana Ruiz")).toContain(
      "Ana Ruiz loses access now; their agent grants in this org end.",
    )
  })
})

describe("roles and labels", () => {
  it("shows a stored role string as its highest role", () => {
    expect(topRoleOf("admin,member")).toBe("admin")
    expect(roleLabelOf("member")).toBe("Member")
    expect(roleLabelOf("unknown-role")).toBe("Viewer")
  })
})

describe("invitations", () => {
  const now = new Date("2026-10-16T12:00:00Z")
  const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

  it("is expired once its expiry has passed, whatever the stored status", () => {
    expect(invitationState(inDays(-1), now)).toBe("expired")
    expect(invitationState(inDays(5), now)).toBe("pending")
    expect(invitationState("not a date", now)).toBe("pending")
  })

  it("says when it expires, and says expired for a past one", () => {
    expect(expiryCopy(inDays(5), now)).toBe("expires in 5 days")
    expect(expiryCopy(inDays(1), now)).toBe("expires in 1 day")
    expect(expiryCopy(inDays(-2), now)).toBe("expired")
  })

  it("says when it was sent, and falls back when the time is unknown", () => {
    expect(sentCopy(inDays(-2), now)).toBe("Sent 2 days ago")
    expect(sentCopy(undefined, now)).toBe("Sent")
  })

  it("splits typed addresses, drops duplicates and names what is not an address", () => {
    expect(
      parseInviteEmails("ana@acme.dev, Ana@acme.dev\nbo@acme.dev ; nope, sam@contractor.io"),
    ).toEqual({
      emails: ["ana@acme.dev", "bo@acme.dev", "sam@contractor.io"],
      invalid: ["nope"],
    })
    expect(parseInviteEmails("  ")).toEqual({ emails: [], invalid: [] })
  })
})

describe("display copy", () => {
  const now = new Date("2026-10-16T12:00:00Z")

  it("reads last active as Now, a relative time, or Never", () => {
    expect(lastActiveCopy(null, now)).toBe("Never")
    expect(lastActiveCopy(new Date(now.getTime() - 20_000).toISOString(), now)).toBe("Now")
    expect(lastActiveCopy(new Date(now.getTime() - 2 * 3_600_000).toISOString(), now)).toBe(
      "2 hours ago",
    )
    expect(lastActiveCopy(new Date(now.getTime() - 86_400_000).toISOString(), now)).toBe(
      "yesterday",
    )
  })

  it("makes initials from the name, or the email when there is no name", () => {
    expect(initialsOf("Priya Shah", "priya@acme.dev")).toBe("PS")
    expect(initialsOf("", "sam@contractor.io")).toBe("SC")
    expect(initialsOf("Jordan Lee (you)", "")).toBe("JL")
  })
})
