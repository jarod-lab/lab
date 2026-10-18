import { allowed, covers, type PermissionSet } from "@starter/api"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createTestAuth } from "./auth.test.helpers"
import {
  narrow,
  OAUTH_EXCLUDED,
  OAUTH_SCOPE_GRANTS,
  OWNER_ONLY_RESOURCES,
  PERSON_ONLY_ACTIONS,
  PERSON_ONLY_RESOURCES,
  rolePermissions,
  roles,
  scopePermissions,
  statements,
} from "./permissions"

const everyAction = Object.entries(statements).flatMap(([resource, actions]) =>
  actions.map((action) => ({ [resource]: [action] }) as PermissionSet),
)

describe("rolePermissions matches better-auth's hasPermission (real Postgres via PGlite)", () => {
  let t: Awaited<ReturnType<typeof createTestAuth>>
  let orgId: string
  const cookies: Record<string, string> = {}
  const ROLES = [...Object.keys(roles), "admin,member", "viewer,member", "unknown"]

  beforeAll(async () => {
    t = await createTestAuth()
    const owner = await t.signUp("Owner")
    orgId = owner.orgId
    cookies.owner = owner.cookie
    for (const role of ROLES.filter((r) => r !== "owner")) {
      const u = await t.signUp(role)
      await t.addMember(orgId, u.userId, role)
      cookies[role] = u.cookie
    }
  })
  afterAll(() => t.close())

  const better = async (role: string, permissions: PermissionSet) => {
    const res = await t.auth.api.hasPermission({
      headers: new Headers({ cookie: cookies[role] ?? "" }),
      body: { organizationId: orgId, permissions: permissions as never },
    })
    return res.success
  }

  it.each(ROLES)("agrees on every single action for %s", async (role) => {
    for (const need of everyAction) {
      expect(allowed(rolePermissions(role), need), `${role} ${JSON.stringify(need)}`).toBe(
        await better(role, need),
      )
    }
  })

  it("agrees that a multi-role member needs one role covering the whole request", async () => {
    // member can create projects, viewer can only read: no single role of "viewer,member" can
    // both create a project and update the org, and admin can't delete the org.
    const requests: PermissionSet[] = [
      { project: ["create", "read"] },
      { project: ["create"], organization: ["update"] },
      { project: ["read"], ac: ["read"] },
      { organization: ["update", "delete"] },
    ]
    for (const role of ROLES) {
      for (const need of requests) {
        expect(allowed(rolePermissions(role), need), `${role} ${JSON.stringify(need)}`).toBe(
          await better(role, need),
        )
      }
    }
  })
})

describe("OAuth scopes", () => {
  it("reach every catalog action, except the deliberately excluded ones", () => {
    const reachable = scopePermissions(Object.keys(OAUTH_SCOPE_GRANTS))
    for (const need of everyAction) {
      const excluded = covers(OAUTH_EXCLUDED as PermissionSet, need)
      expect(covers(reachable, need), JSON.stringify(need)).toBe(!excluded)
    }
  })

  it("exclude every action of the person-only resources and actions", () => {
    for (const resource of PERSON_ONLY_RESOURCES) {
      for (const action of statements[resource]) {
        expect(covers(OAUTH_EXCLUDED as PermissionSet, { [resource]: [action] })).toBe(true)
      }
    }
    for (const [resource, actions] of Object.entries(PERSON_ONLY_ACTIONS)) {
      for (const action of actions) {
        expect(covers(OAUTH_EXCLUDED as PermissionSet, { [resource]: [action] })).toBe(true)
      }
    }
  })

  it("keep the owner-only resources out of the admin role", () => {
    for (const resource of OWNER_ONLY_RESOURCES) {
      const need = { [resource]: [statements[resource][0]] } as PermissionSet
      expect(allowed(rolePermissions("owner"), need)).toBe(true)
      expect(allowed(rolePermissions("admin"), need)).toBe(false)
    }
  })

  it("ignore non-permission scopes like openid", () => {
    expect(scopePermissions(["openid", "offline_access"])).toEqual({})
    expect(scopePermissions(["read"])).toEqual({
      project: ["read"],
      apiKey: ["read"],
      agent: ["read"],
      run: ["read"],
    })
  })

  it("narrow each role to the token's scopes, dropping roles left with nothing", () => {
    const grants = narrow(rolePermissions("viewer,member"), scopePermissions(["read"]))
    const read = { agent: ["read"], project: ["read"], run: ["read"] }
    expect(grants).toEqual([read, { apiKey: ["read"], ...read }])
    expect(narrow(rolePermissions("viewer"), scopePermissions(["admin"]))).toEqual([])
  })
})
