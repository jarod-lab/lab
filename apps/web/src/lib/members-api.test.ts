import { describe, expect, it, vi } from "vitest"

import { json, productFetch } from "../test/product-fetch"
import { createMembersApi } from "./members-api"

describe("product calls for members", () => {
  it("reads member security with the organization header", async () => {
    const { fetchImpl, sent } = productFetch(() =>
      json({
        members: [
          {
            userId: "user-2",
            name: "Bo",
            email: "bo@acme.dev",
            role: "admin",
            twoFactorEnabled: true,
            lastActiveAt: null,
          },
        ],
      }),
    )
    const members = await createMembersApi(undefined, fetchImpl).listSecurity("org-a")
    expect(members[0]?.twoFactorEnabled).toBe(true)
    expect(sent[0]).toMatchObject({
      method: "GET",
      path: "/v1/members/security",
      organization: "org-a",
    })
  })

  it("resets a member's two-factor by user id", async () => {
    const { fetchImpl, sent } = productFetch(() => json({ reset: true }))
    await createMembersApi(undefined, fetchImpl).resetTwoFactor("org-a", "user-2")
    expect(sent[0]).toMatchObject({
      method: "POST",
      path: "/v1/members/user-2/two-factor/reset",
      organization: "org-a",
    })
  })

  it("shows the server's message and hint when a product call is refused", async () => {
    const { fetchImpl } = productFetch(() =>
      json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Only an owner can reset two-factor",
            hint: "Ask an owner.",
          },
        },
        { status: 403 },
      ),
    )
    await expect(
      createMembersApi(undefined, fetchImpl).resetTwoFactor("org-a", "user-2"),
    ).rejects.toThrow("Only an owner can reset two-factor Ask an owner.")
  })
})

describe("better-auth calls for members", () => {
  it("sends an invitation with the organization named, and resend only when asked", async () => {
    const calls: { url: string; body: unknown }[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return json({ id: "inv-1", status: "pending" })
    })
    const api = createMembersApi("http://localhost", fetchImpl as unknown as typeof fetch)
    await api.invite("org-a", { email: "lee@acme.dev", role: "member" })
    await api.invite("org-a", { email: "lee@acme.dev", role: "member", resend: true })
    expect(calls[0]?.url).toContain("/organization/invite-member")
    expect(calls[0]?.body).toEqual({
      email: "lee@acme.dev",
      role: "member",
      organizationId: "org-a",
    })
    expect(calls[1]?.body).toEqual({
      email: "lee@acme.dev",
      role: "member",
      organizationId: "org-a",
      resend: true,
    })
  })

  it("lists invitations for the named organization", async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return json([
        {
          id: "inv-1",
          email: "lee@acme.dev",
          role: "member",
          status: "pending",
          expiresAt: "2026-10-21T00:00:00.000Z",
        },
      ])
    })
    const invitations = await createMembersApi(
      "http://localhost",
      fetchImpl as unknown as typeof fetch,
    ).listInvitations("org-a")
    expect(invitations[0]?.email).toBe("lee@acme.dev")
    expect(calls[0]).toContain("/organization/list-invitations")
    expect(calls[0]).toContain("organizationId=org-a")
  })
})
