// The device grant's rules at the auth layer: which approvals count, what the token endpoint answers
// for each code state, and that no code without an organization ever gets a token. The full flow
// over the app's HTTP surface is in apps/api/src/device-flow.test.ts.
import { decodeJwt } from "jose"
import { describe, expect, it } from "vitest"
import { AUDIENCE, BASE, createTestAuth } from "./auth.test.helpers"

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

type Harness = Awaited<ReturnType<typeof createTestAuth>>

const call = (t: Harness, path: string, init: RequestInit = {}) =>
  t.auth.handler(new Request(`${BASE}/api/auth${path}`, init))

const json = (body: unknown, cookie?: string): RequestInit => ({
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(cookie ? { cookie, origin: BASE } : {}),
  },
  body: JSON.stringify(body),
})

async function publicClient(t: Harness) {
  const res = await call(
    t,
    "/oauth2/register",
    json({
      client_name: "Device CLI",
      token_endpoint_auth_method: "none",
      grant_types: [DEVICE_GRANT, "refresh_token"],
    }),
  )
  return ((await res.json()) as { client_id: string }).client_id
}

async function deviceCode(t: Harness, clientId: string) {
  const res = await call(
    t,
    "/device/code",
    json({ client_id: clientId, scope: "read", resource: AUDIENCE }),
  )
  expect(res.status).toBe(200)
  return (await res.json()) as { device_code: string; user_code: string }
}

/** The verification page's claim (GET) and the approval (POST), as the browser makes them. */
async function review(t: Harness, userCode: string, cookie: string) {
  return call(t, `/device?user_code=${encodeURIComponent(userCode)}`, {
    headers: { cookie, origin: BASE },
  })
}

async function approve(t: Harness, userCode: string, cookie: string) {
  await review(t, userCode, cookie)
  return call(t, "/device/approve", json({ userCode }, cookie))
}

async function poll(t: Harness, clientId: string, deviceCodeValue: string) {
  const res = await call(t, "/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: DEVICE_GRANT,
      device_code: deviceCodeValue,
      client_id: clientId,
    }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe("device grant rules", () => {
  it("answers pending, then issues a token for the approver's active organization", async () => {
    const t = await createTestAuth()
    try {
      const alice = await t.signUp("Alice")
      const clientId = await publicClient(t)
      const code = await deviceCode(t, clientId)

      expect(await poll(t, clientId, code.device_code)).toMatchObject({
        status: 400,
        body: { error: "authorization_pending" },
      })

      // The user code may be typed in another case, with separators (normalised, as the plugin does).
      const typed = code.user_code.toLowerCase()
      const approved = await approve(t, typed, alice.cookie)
      expect(approved.status).toBe(200)

      // Let the plugin's polling interval pass after the pending poll.
      await new Promise((resolve) => setTimeout(resolve, 5_100))
      const token = await poll(t, clientId, code.device_code)
      expect(token.status).toBe(200)
      expect(token.body).toHaveProperty("access_token")
    } finally {
      await t.close()
    }
  }, 30_000)

  it("refuses approval from an organization the approver has left, and issues no token", async () => {
    const t = await createTestAuth()
    try {
      const alice = await t.signUp("Alice")
      const bob = await t.signUp("Bob")
      await t.addMember(alice.orgId, bob.userId, "member")
      await t.setActive(bob.cookie, alice.orgId)
      const clientId = await publicClient(t)
      const code = await deviceCode(t, clientId)

      // Bob's session still points at Alice's organization after he is removed from it.
      const ctx = await t.auth.$context
      await ctx.adapter.delete({
        model: "member",
        where: [
          { field: "userId", value: bob.userId },
          { field: "organizationId", value: alice.orgId },
        ],
      })

      const refused = await approve(t, code.user_code, bob.cookie)
      expect(refused.status).toBe(400)
      expect(await refused.json()).toMatchObject({ error: "invalid_request" })

      // A refused approval leaves the code pending (the check runs before the plugin approves it).
      expect(await poll(t, clientId, code.device_code)).toMatchObject({
        status: 400,
        body: { error: "authorization_pending" },
      })

      // Bob picks an organization he belongs to, approves, and the token acts in that one.
      await t.setActive(bob.cookie, bob.orgId)
      expect((await approve(t, code.user_code, bob.cookie)).status).toBe(200)
      await new Promise((resolve) => setTimeout(resolve, 5_100))
      const token = await poll(t, clientId, code.device_code)
      expect(token.status).toBe(200)
      expect(decodeJwt(String(token.body.access_token)).org).toBe(bob.orgId)
    } finally {
      await t.close()
    }
  }, 30_000)

  it("keeps the organization of the first approval when the approver switches and approves again", async () => {
    const t = await createTestAuth()
    try {
      const alice = await t.signUp("Alice")
      const bob = await t.signUp("Bob")
      await t.addMember(bob.orgId, alice.userId, "member")
      const clientId = await publicClient(t)
      const code = await deviceCode(t, clientId)

      expect((await approve(t, code.user_code, alice.cookie)).status).toBe(200)
      await t.setActive(alice.cookie, bob.orgId)
      // The code is already approved: the plugin refuses, and the organization stays the first one.
      expect((await approve(t, code.user_code, alice.cookie)).status).toBe(400)

      const token = await poll(t, clientId, code.device_code)
      expect(token.status).toBe(200)
      expect(decodeJwt(String(token.body.access_token)).org).toBe(alice.orgId)
    } finally {
      await t.close()
    }
  })

  it("never issues a token for an approved code whose organization was not recorded", async () => {
    const t = await createTestAuth()
    try {
      const alice = await t.signUp("Alice")
      const clientId = await publicClient(t)
      const code = await deviceCode(t, clientId)
      expect((await approve(t, code.user_code, alice.cookie)).status).toBe(200)

      // Drop the organization record the approval wrote.
      const ctx = await t.auth.$context
      await ctx.adapter.deleteMany({
        model: "verification",
        where: [{ field: "identifier", value: "device-org:", operator: "starts_with" }],
      })

      expect(await poll(t, clientId, code.device_code)).toMatchObject({
        status: 400,
        body: { error: "invalid_grant" },
      })
    } finally {
      await t.close()
    }
  })

  it("answers a denied code as the plugin does", async () => {
    const t = await createTestAuth()
    try {
      const alice = await t.signUp("Alice")
      const clientId = await publicClient(t)
      const code = await deviceCode(t, clientId)
      await review(t, code.user_code, alice.cookie)
      const denied = await call(t, "/device/deny", json({ userCode: code.user_code }, alice.cookie))
      expect(denied.status).toBe(200)

      expect(await poll(t, clientId, code.device_code)).toMatchObject({
        status: 400,
        body: { error: "access_denied" },
      })
    } finally {
      await t.close()
    }
  })

  it("ignores approvals of unknown codes (the plugin answers them)", async () => {
    const t = await createTestAuth()
    try {
      const alice = await t.signUp("Alice")
      const res = await approve(t, "NOSUCHCODE", alice.cookie)
      expect(res.status).toBe(400)
    } finally {
      await t.close()
    }
  })
})
