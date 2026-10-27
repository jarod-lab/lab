// GET /v1/invitations/:id/preview: what the emailed link shows before anyone signs in.
import { afterAll, describe, expect, it } from "vitest"

import { createTestApp } from "./app.test.helpers"

const t = await createTestApp()
afterAll(() => t.close())

const preview = async (id: string, credential?: string) => {
  const res = await t.req(`/v1/invitations/${id}/preview`, credential ? t.as(credential) : {})
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function invite(email: string, role: "member" | "viewer" = "member") {
  const host = await t.signUp("Host")
  const sent = await t.auth.api.createInvitation({
    body: { email, role, organizationId: host.orgId },
    headers: new Headers({ cookie: host.cookie }),
  })
  return { host, id: sent.id }
}

describe("get_invitation_preview", () => {
  it("shows the organization, role and invited address with no credential", async () => {
    const { id } = await invite("newcomer@example.com", "viewer")
    const res = await preview(id)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      role: "viewer",
      status: "pending",
      inviterName: "Host",
      email: "newcomer@example.com",
    })
    expect(res.body).not.toHaveProperty("hasAccount")
    expect(typeof res.body.organizationName).toBe("string")
  })

  it("ignores a credential sent with it", async () => {
    const { id } = await invite("ignored@example.com")
    expect((await preview(id, "sk_not_a_real_key")).status).toBe(200)
  })

  it("answers an unknown id as NOT_FOUND", async () => {
    const res = await preview("no-such-invitation")
    expect(res.status).toBe(404)
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } })
  })

  it("keeps the address to itself once the invitation is no longer open", async () => {
    const { host, id } = await invite("closed@example.com")
    await t.auth.api.cancelInvitation({
      body: { invitationId: id },
      headers: new Headers({ cookie: host.cookie }),
    })
    const res = await preview(id)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      status: "canceled",
      email: null,
    })
  })
})
