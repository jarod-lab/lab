// Support (@byo-oss/support) as this app mounts it (packages/auth/src/support.ts), over HTTP: the
// operator organization's members with support:read are the staff, customers open tickets with a
// cookie session, and nothing else gets in. Agent replies reach the requester as a notification
// (never an internal note) and as mail on the auth emails' SES path.
import { sweepAll } from "@byo-oss/core"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { BASE, createTestApp } from "./app.test.helpers"
import { rawMessage, testDkim } from "./dkim.test.helpers"

/** The staff organization, seeded with a fixed id as support's README shows. */
const STAFF_ORG = "org_support_staff"
/** The inbound relay's shared secret (support's rawRelay, SUPPORT_INBOUND_SECRET). */
const INBOUND_SECRET = "inbound-relay-secret-for-tests"
/** The DNS support's DKIM check reads (`inbound.resolver`): keys the tests publish, nothing else. */
const dns = testDkim()

type Json = Record<string, unknown>
let t: Awaited<ReturnType<typeof createTestApp>>
let agent: Awaited<ReturnType<typeof t.signUp>>
let staffViewer: Awaited<ReturnType<typeof t.signUp>>
let customer: Awaited<ReturnType<typeof t.signUp>>

beforeAll(async () => {
  t = await createTestApp([], {
    support: {
      staffOrganizationId: STAFF_ORG,
      email: {
        from: "Support <support@example.com>",
        replyDomain: "support.example.com",
        appUrl: BASE,
        replyDelay: 0,
      },
      inbound: { secret: INBOUND_SECRET, resolver: dns.resolver },
    },
  })
  const ctx = await t.auth.$context
  await ctx.adapter.create({
    model: "organization",
    forceAllowId: true,
    data: { id: STAFF_ORG, name: "Support team", slug: "support-team", createdAt: new Date() },
  })
  agent = await t.signUp("Agent")
  staffViewer = await t.signUp("Staff viewer")
  customer = await t.signUp("Customer")
  for (const [userId, role] of [
    [t.owner.userId, "owner"],
    [agent.userId, "member"],
    [staffViewer.userId, "viewer"],
  ] as const) {
    await ctx.adapter.create({
      model: "member",
      data: { organizationId: STAFF_ORG, userId, role, createdAt: new Date() },
    })
  }
})
afterAll(() => t.close())

const call = async (cookie: string, path: string, init: RequestInit = {}) => {
  const res = await t.req(`/api/auth/support${path}`, t.as(cookie, init))
  return { status: res.status, body: (await res.json()) as Json }
}
const post = (cookie: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(cookie, path, { method: "POST", body: JSON.stringify(body), headers })

const openTicket = async (cookie: string, subject: string) => {
  const res = await post(cookie, "/create-ticket", { subject, body: "It broke." })
  expect(res.status).toBe(200)
  return res.body.ticket as { id: string; number: number }
}

const inbox = async (cookie: string) => {
  const res = await t.req("/api/auth/inbox/list?filter=all", t.as(cookie))
  return ((await res.json()) as { notifications: { type: string; href?: string }[] }).notifications
}

describe("support", () => {
  it("lets a customer open a ticket and an operator-organization agent see it in the queue", async () => {
    const ticket = await openTicket(customer.cookie, "Can't export")
    const mine = await call(customer.cookie, "/my-tickets")
    expect(mine.status).toBe(200)
    expect((mine.body.tickets as { id: string }[]).map((x) => x.id)).toContain(ticket.id)

    // The agent's active organization is their personal one: support checks the staff membership.
    const queue = await call(agent.cookie, "/agent/tickets")
    expect(queue.status).toBe(200)
    expect((queue.body.tickets as { id: string }[]).map((x) => x.id)).toContain(ticket.id)
    expect(queue.body.features).toEqual({ attachments: false, merge: true })
  })

  it("refuses the queue to staff without support:read and to customers", async () => {
    for (const cookie of [staffViewer.cookie, customer.cookie, t.other.cookie]) {
      const res = await call(cookie, "/agent/tickets")
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ code: "NOT_ALLOWED" })
    }
  })

  it("tells the staff about a new ticket, through the catalog", async () => {
    const ticket = await openTicket(customer.cookie, "New ticket notice")
    const rows = (await inbox(agent.cookie)).filter((n) => n.type === "support.ticket.created")
    expect(rows.map((n) => n.href)).toContain(`/admin/support/${ticket.id}`)
    // A staff viewer can't read the queue, so isn't told; the customer caused it, so isn't either.
    expect((await inbox(staffViewer.cookie)).map((n) => n.type)).not.toContain(
      "support.ticket.created",
    )
    expect((await inbox(customer.cookie)).map((n) => n.type)).not.toContain(
      "support.ticket.created",
    )
  })

  describe("refuses every session that is not a plain cookie session", () => {
    it("a cookie sent with an API key or a bearer token: 403", async () => {
      const credentials: Record<string, string>[] = [
        { "x-api-key": t.fullKey },
        { authorization: `Bearer ${t.fullKey}` },
        { authorization: "Bearer an-oauth-access-token" },
      ]
      for (const headers of credentials) {
        const create = await post(
          customer.cookie,
          "/create-ticket",
          { subject: "x", body: "y" },
          headers,
        )
        expect(create.status).toBe(403)
        expect(create.body).toMatchObject({ code: "SESSION_NOT_ACCEPTED" })
        const queue = await call(agent.cookie, "/agent/tickets", { headers })
        expect(queue.status).toBe(403)
        expect(queue.body).toMatchObject({ code: "SESSION_NOT_ACCEPTED" })
      }
    })

    it("an API key or a bearer token alone has no session: 401", async () => {
      const credentials: Record<string, string>[] = [
        { "x-api-key": t.fullKey },
        { authorization: `Bearer ${t.fullKey}` },
      ]
      for (const headers of credentials) {
        const res = await t.req("/api/auth/support/my-tickets", { headers })
        expect(res.status).toBe(401)
      }
    })

    it("an impersonated session: 403, for reads and writes", async () => {
      const admin = await t.signUp("Platform admin")
      const ctx = await t.auth.$context
      await ctx.adapter.updateMany({
        model: "user",
        where: [{ field: "id", value: admin.userId }],
        update: { role: "admin" },
      })
      const start = await t.req(
        "/api/auth/admin/impersonate-user",
        t.as(admin.cookie, { method: "POST", body: JSON.stringify({ userId: customer.userId }) }),
      )
      expect(start.status).toBe(200)
      // The response first clears the admin's own cookie, then sets the impersonated session's.
      const impersonated = start.headers
        .getSetCookie()
        .map((c) => c.split(";")[0] ?? "")
        .filter((c) => c.startsWith("better-auth.session_token=") && !c.endsWith("="))
        .at(-1)
      expect(impersonated).toBeDefined()
      const cookie = impersonated ?? ""

      // The app's impersonation guard answers before support's own refusal (acceptSupportSession).
      const read = await call(cookie, "/my-tickets")
      expect(read.status).toBe(403)
      expect(read.body).toMatchObject({ code: "IMPERSONATED_SESSION_NOT_ALLOWED" })
      const write = await post(cookie, "/create-ticket", { subject: "x", body: "y" })
      expect(write.status).toBe(403)
      expect(write.body).toMatchObject({ code: "IMPERSONATED_SESSION_NOT_ALLOWED" })
    })
  })

  it("an agent's reply reaches the requester as a notification and by mail; a note does neither", async () => {
    // Thread mail goes to a verified address only.
    const ctx = await t.auth.$context
    await ctx.adapter.updateMany({
      model: "user",
      where: [{ field: "id", value: customer.userId }],
      update: { emailVerified: true },
    })
    const ticket = await openTicket(customer.cookie, "Reply please")
    const agentReplies = async () =>
      (await inbox(customer.cookie)).filter(
        (n) => n.type === "support.agent.replied" && n.href === `/account/support/${ticket.id}`,
      )

    const note = await post(agent.cookie, "/agent/reply", {
      ticketId: ticket.id,
      body: "Internal: customer is on the old plan.",
      internal: true,
    })
    expect(note.status).toBe(200)
    expect(await agentReplies()).toEqual([])

    const reply = await post(agent.cookie, "/agent/reply", {
      ticketId: ticket.id,
      body: "Fixed, try again.",
    })
    expect(reply.status).toBe(200)
    expect(await agentReplies()).toHaveLength(1)

    // The sweep (server.ts runs it every minute) sends the queued reply through the fake SES.
    const before = t.outbox.length
    await sweepAll(t.auth)
    const mail = t.outbox.slice(before).filter((m) => m.to === customer.email)
    expect(mail).toEqual([
      expect.objectContaining({
        subject: `[#${ticket.number}] Reply please`,
        link: `${BASE}/account/support/${ticket.id}`,
      }),
    ])
  })

  it("mentions reach the agent mentioned", async () => {
    const ticket = await openTicket(customer.cookie, "Mention")
    const res = await post(t.owner.cookie, "/agent/reply", {
      ticketId: ticket.id,
      body: "@Agent can you look?",
      internal: true,
      mentions: [agent.userId],
    })
    expect(res.status).toBe(200)
    const rows = (await inbox(agent.cookie)).filter((n) => n.type === "support.agent.mentioned")
    expect(rows.map((n) => n.href)).toContain(`/admin/support/${ticket.id}`)
  })

  describe("inbound mail from a relay", () => {
    const relay = (raw: string, secret = INBOUND_SECRET) =>
      t.req("/api/auth/support/inbound", {
        method: "POST",
        headers: { "content-type": "message/rfc822", authorization: `Bearer ${secret}` },
        body: raw,
      })

    it("refuses a relay without the secret", async () => {
      const res = await relay(
        rawMessage({ from: "x@example.com", to: "y@example.com", subject: "s", text: "t" }),
        "wrong",
      )
      expect(res.status).toBe(401)
    })

    it("threads the requester's signed reply onto their ticket; unsigned mail does not", async () => {
      const ctx = await t.auth.$context
      await ctx.adapter.updateMany({
        model: "user",
        where: [{ field: "id", value: customer.userId }],
        update: { emailVerified: true },
      })
      const ticket = await openTicket(customer.cookie, "Reply by email")
      expect(
        (await post(agent.cookie, "/agent/reply", { ticketId: ticket.id, body: "Try now?" }))
          .status,
      ).toBe(200)
      const before = t.outbox.length
      await sweepAll(t.auth)
      const replyTo = t.outbox.slice(before).find((m) => m.to === customer.email)?.replyTo
      expect(replyTo).toMatch(/^support\+[^@]+@support\.example\.com$/)

      const thread = async () => {
        const res = await call(customer.cookie, `/ticket?id=${ticket.id}`)
        return (res.body.messages as { body: string; channel: string }[]).map((m) => m.body)
      }
      const mail = (text: string) =>
        rawMessage({ from: customer.email, to: replyTo ?? "", subject: "Re: Reply by email", text })

      // Unsigned, the reply can't prove it is the requester's: it is not added to their ticket.
      expect((await relay(mail("Unsigned: still broken."))).status).toBe(202)
      expect(await thread()).not.toContain("Unsigned: still broken.")

      const key = dns.key(customer.email.slice(customer.email.indexOf("@") + 1))
      expect((await relay(await key.sign(mail("Signed: works now, thanks.")))).status).toBe(202)
      expect(await thread()).toContain("Signed: works now, thanks.")
    })
  })
})
