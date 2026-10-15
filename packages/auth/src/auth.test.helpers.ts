// Test-only: an auth instance on in-process Postgres (PGlite), with helpers for users and orgs.
import { createTestDb } from "@starter/db/testing"
import { createAuth } from "./index"
import { firstMembership } from "./membership"

export const BASE = "http://localhost:3000"
export const AUDIENCE = `${BASE}/mcp`

export async function createTestAuth() {
  const t = await createTestDb()
  const auth = createAuth({
    db: t.db,
    secret: "a-test-secret-that-is-long-enough-123456", // gitleaks:allow
    baseURL: BASE,
    emailFrom: "Test <auth@example.com>",
    oauthResources: [BASE, AUDIENCE],
  })
  let n = 0

  /** Sign up a fresh user. Returns their id, session cookie and personal organization id. */
  async function signUp(name = "User") {
    n++
    const res = await auth.api.signUpEmail({
      body: { email: `user${n}@example.com`, password: "correct-horse-battery", name },
      returnHeaders: true,
    })
    const userId = res.response.user.id
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
    const member = await firstMembership((await auth.$context).adapter, userId)
    if (!member) throw new Error("signup did not create a personal organization")
    return { userId, cookie, orgId: member.organizationId, email: `user${n}@example.com` }
  }

  /** Add a user to an organization with a role ("admin", "member", "admin,member", ...). */
  const addMember = (organizationId: string, userId: string, role: string) =>
    auth.api.addMember({ body: { organizationId, userId, role: role.split(",") as never } })

  /** Make `orgId` the active organization of the session behind `cookie`. */
  const setActive = (cookie: string, organizationId: string) =>
    auth.api.setActiveOrganization({ headers: new Headers({ cookie }), body: { organizationId } })

  return { auth, signUp, addMember, setActive, close: t.close }
}
