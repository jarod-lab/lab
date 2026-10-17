// Removing a member ends the agent access they granted in that organization. Without that, removing
// and later re-adding someone revived the tokens their agent already held.
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { BASE, createTestApp } from "./app.test.helpers"

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"
const MCP = `${BASE}/mcp`

describe("member removal ends their agents' access (real device grant)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  beforeAll(async () => {
    t = await createTestApp()
  })
  afterAll(() => t.close())

  /** A member of the owner's organization, with it active in their session. */
  async function member(name: string) {
    const m = await t.signUp(name)
    await t.auth.api.addMember({
      body: { organizationId: t.owner.orgId, userId: m.userId, role: "member" },
    })
    await t.auth.api.setActiveOrganization({
      headers: new Headers({ cookie: m.cookie }),
      body: { organizationId: t.owner.orgId },
    })
    return m
  }

  /** An agent the member connects to the owner's organization through the device grant. */
  async function connectAgent(cookie: string) {
    const reg = await t.req("/api/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Member's agent",
        token_endpoint_auth_method: "none",
        grant_types: [DEVICE_GRANT, "refresh_token"],
      }),
    })
    const { client_id: clientId } = (await reg.json()) as { client_id: string }
    const code = await t.req("/api/auth/device/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, scope: "read offline_access", resource: MCP }),
    })
    const device = (await code.json()) as {
      device_code: string
      user_code: string
      interval: number
    }
    await t.req(`/api/auth/device?user_code=${encodeURIComponent(device.user_code)}`, t.as(cookie))
    const approved = await t.req(
      "/api/auth/device/approve",
      t.as(cookie, { method: "POST", body: JSON.stringify({ userCode: device.user_code }) }),
    )
    expect(approved.status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, device.interval * 1000 + 100))
    const res = await t.req("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: DEVICE_GRANT,
        device_code: device.device_code,
        client_id: clientId,
      }),
    })
    const tokens = (await res.json()) as { access_token: string; refresh_token: string }
    return { clientId, access: tokens.access_token, refresh: tokens.refresh_token }
  }

  /** Whether the access token still gets an answer from whoami over MCP. */
  async function works(access: string): Promise<boolean> {
    try {
      const mcp = await t.mcpClient({ authorization: `Bearer ${access}` })
      const who = await mcp.callTool({ name: "whoami", arguments: {} })
      await mcp.close()
      return !who.isError
    } catch {
      return false
    }
  }

  const refresh = (agent: { clientId: string; refresh: string }) =>
    t.req("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: agent.refresh,
        client_id: agent.clientId,
      }),
    })

  const reAdd = (userId: string) =>
    t.auth.api.addMember({ body: { organizationId: t.owner.orgId, userId, role: "member" } })

  it("when an admin removes them, even if they are added back later", async () => {
    const m = await member("Removed")
    const agent = await connectAgent(m.cookie)
    expect(await works(agent.access)).toBe(true)

    const removed = await t.req(
      "/api/auth/organization/remove-member",
      t.as(t.owner.cookie, {
        method: "POST",
        body: JSON.stringify({ memberIdOrEmail: m.email, organizationId: t.owner.orgId }),
      }),
    )
    expect(removed.status).toBe(200)
    await reAdd(m.userId)

    expect(await works(agent.access)).toBe(false)
    expect((await refresh(agent)).status).toBeGreaterThanOrEqual(400)
  }, 30_000)

  it("when they leave, even if they are added back later", async () => {
    const m = await member("Leaver")
    const agent = await connectAgent(m.cookie)
    expect(await works(agent.access)).toBe(true)

    const left = await t.req(
      "/api/auth/organization/leave",
      t.as(m.cookie, { method: "POST", body: JSON.stringify({ organizationId: t.owner.orgId }) }),
    )
    expect(left.status).toBe(200)
    await reAdd(m.userId)

    expect(await works(agent.access)).toBe(false)
    expect((await refresh(agent)).status).toBeGreaterThanOrEqual(400)
  }, 30_000)

  it("keeps the grants when the leave is refused (the only owner can't leave)", async () => {
    const agent = await connectAgent(t.owner.cookie)
    const refused = await t.req(
      "/api/auth/organization/leave",
      t.as(t.owner.cookie, {
        method: "POST",
        body: JSON.stringify({ organizationId: t.owner.orgId }),
      }),
    )
    expect(refused.status).toBeGreaterThanOrEqual(400)
    expect(await works(agent.access)).toBe(true)
    expect((await refresh(agent)).status).toBe(200)
  }, 30_000)

  it("leaves other members' agents alone", async () => {
    const stays = await member("Stays")
    const agent = await connectAgent(stays.cookie)
    const goes = await member("Goes")
    await t.req(
      "/api/auth/organization/remove-member",
      t.as(t.owner.cookie, {
        method: "POST",
        body: JSON.stringify({ memberIdOrEmail: goes.email, organizationId: t.owner.orgId }),
      }),
    )
    expect(await works(agent.access)).toBe(true)
    expect((await refresh(agent)).status).toBe(200)
  }, 30_000)
})

describe("a ban ends the user's agents' access (real device grant)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>
  beforeAll(async () => {
    t = await createTestApp()
  })
  afterAll(() => t.close())

  async function works(access: string): Promise<boolean> {
    const res = await t.req("/v1/whoami", { headers: { authorization: `Bearer ${access}` } })
    return res.status === 200
  }

  async function connectAgent(cookie: string) {
    const reg = await t.req("/api/auth/oauth2/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Banned user's agent",
        token_endpoint_auth_method: "none",
        grant_types: [DEVICE_GRANT, "refresh_token"],
      }),
    })
    const { client_id: clientId } = (await reg.json()) as { client_id: string }
    const code = await t.req("/api/auth/device/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, scope: "read offline_access", resource: MCP }),
    })
    const device = (await code.json()) as {
      device_code: string
      user_code: string
      interval: number
    }
    await t.req(`/api/auth/device?user_code=${encodeURIComponent(device.user_code)}`, t.as(cookie))
    await t.req(
      "/api/auth/device/approve",
      t.as(cookie, { method: "POST", body: JSON.stringify({ userCode: device.user_code }) }),
    )
    await new Promise((resolve) => setTimeout(resolve, device.interval * 1000 + 100))
    const res = await t.req("/api/auth/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: DEVICE_GRANT,
        device_code: device.device_code,
        client_id: clientId,
      }),
    })
    return ((await res.json()) as { access_token: string }).access_token
  }

  async function ban(userId: string, banExpiresIn?: number) {
    const root = await t.signUp("Root")
    await (await t.auth.$context).adapter.updateMany({
      model: "user",
      where: [{ field: "id", value: root.userId }],
      update: { role: "admin" },
    })
    const res = await t.req(
      "/api/auth/admin/ban-user",
      t.as(root.cookie, { method: "POST", body: JSON.stringify({ userId, banExpiresIn }) }),
    )
    expect(res.status).toBe(200)
  }

  it("refuses the agent's token once the user is banned", async () => {
    const u = await t.signUp("Banned")
    const access = await connectAgent(u.cookie)
    expect(await works(access)).toBe(true)

    await ban(u.userId)
    expect(await works(access)).toBe(false)
  }, 30_000)

  it("lets the agent back in once a timed ban has run out", async () => {
    const u = await t.signUp("Timed")
    const access = await connectAgent(u.cookie)
    await ban(u.userId, 60)
    expect(await works(access)).toBe(false)

    await (await t.auth.$context).adapter.updateMany({
      model: "user",
      where: [{ field: "id", value: u.userId }],
      update: { banExpires: new Date(Date.now() - 1000) },
    })
    expect(await works(access)).toBe(true)
  }, 30_000)
})
