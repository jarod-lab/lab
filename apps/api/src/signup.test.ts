// POST /v1/signup: no credentials, a provisional organization and key, one claim email, and limits
// per client IP and per email domain.
import { describe, expect, it, vi } from "vitest"

import { createTestApp } from "./app.test.helpers"

const json = async (res: Response) => ({
  status: res.status,
  headers: res.headers,
  body: (await res.json()) as Record<string, unknown>,
})

const signup = (
  t: Awaited<ReturnType<typeof createTestApp>>,
  email: string,
  ip?: string,
  credential?: string,
) =>
  t.req("/v1/signup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
      ...(credential ? { "x-api-key": credential } : {}),
    },
    body: JSON.stringify({ email, name: "Ada Agent" }),
  })

describe("signup (REST, no credentials)", () => {
  it("creates a provisional organization and a working key, and sends one claim email", async () => {
    const t = await createTestApp([], { trustProxy: true })
    try {
      const created = await json(await signup(t, "Ada@Example.com", "203.0.113.7"))
      expect(created.status).toBe(200)
      expect(created.body).toMatchObject({
        claimUrlSentTo: "ada@example.com",
        limits: { requestsPerDay: 500 },
      })
      const apiKey = created.body.apiKey as string
      expect(apiKey.startsWith("sk_")).toBe(true)

      const whoami = await json(await t.req("/v1/whoami", t.as(apiKey)))
      expect(whoami.body).toMatchObject({
        organizationId: created.body.organizationId,
        via: "api-key",
        grants: [{ project: ["read", "create", "update", "delete"] }],
        claimed: false,
        usage: { limit: 500 },
      })
      const projects = await json(
        await t.req(
          "/v1/projects",
          t.as(apiKey, { method: "POST", body: JSON.stringify({ name: "First" }) }),
        ),
      )
      expect(projects.status).toBe(200)

      await vi.waitFor(() => {
        const mails = t.outbox.filter((m) => m.to === "ada@example.com")
        if (mails.length !== 1) throw new Error("waiting for the claim email")
        // The reset link carries the claim page as its callback.
        expect(decodeURIComponent(mails[0]?.link ?? "")).toContain("/claim")
      })
    } finally {
      await t.close()
    }
  }, 30_000)

  it("answers CONFLICT for an address that already has an account, without saying more", async () => {
    const t = await createTestApp([], { trustProxy: true })
    try {
      await signup(t, "taken@example.com", "203.0.113.8")
      const again = await json(await signup(t, "taken@example.com", "203.0.113.9"))
      expect(again.status).toBe(409)
      expect(again.body.error).toMatchObject({ code: "CONFLICT" })
      expect(String((again.body.error as { message: string }).message)).toContain("sign-in")
    } finally {
      await t.close()
    }
  }, 30_000)

  it("refuses a malformed email with BAD_REQUEST", async () => {
    const t = await createTestApp([], { trustProxy: true })
    try {
      const res = await json(await signup(t, "not-an-email", "203.0.113.10"))
      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: "BAD_REQUEST" })
    } finally {
      await t.close()
    }
  })

  it("is refused with credentials, which should use the operation's own path", async () => {
    const t = await createTestApp([], { trustProxy: true })
    try {
      const res = await json(await signup(t, "fresh@example.com", "203.0.113.11", t.readKey))
      expect(res.status).toBe(400)
      expect(res.body.error).toMatchObject({ code: "BAD_REQUEST" })
      expect(String((res.body.error as { hint: string }).hint)).toContain("without")
    } finally {
      await t.close()
    }
  })

  it("is not an MCP tool: an agent with a key has no use for it there", async () => {
    const t = await createTestApp()
    try {
      const client = await t.mcpClient(t.fullKey)
      const tools = await client.listTools()
      expect(tools.tools.map((tool) => tool.name)).not.toContain("signup")
      await client.close()
      expect(t.operations.map((op) => op.name)).toContain("signup")
    } finally {
      await t.close()
    }
  })

  it("limits signups per client IP to five an hour", async () => {
    const t = await createTestApp([], { trustProxy: true })
    try {
      for (let i = 1; i <= 5; i++) {
        expect((await signup(t, `ip-${i}@example.com`, "198.51.100.9")).status).toBe(200)
      }
      const limited = await json(await signup(t, "ip-6@example.com", "198.51.100.9"))
      expect(limited.status).toBe(429)
      expect(limited.body.error).toMatchObject({ code: "RATE_LIMITED" })
      expect(limited.headers.get("retry-after")).toBe("3600")
      // Another address is still fine.
      expect((await signup(t, "ip-other@example.com", "198.51.100.10")).status).toBe(200)
    } finally {
      await t.close()
    }
  }, 60_000)

  it("limits signups per email domain to twenty a day, whatever the address", async () => {
    const t = await createTestApp([], { trustProxy: true })
    try {
      for (let i = 1; i <= 20; i++) {
        // A different client each time, so only the domain limit can apply.
        const res = await signup(t, `member${i}@corp.example`, `192.0.2.${i}`)
        expect(res.status, `attempt ${i}`).toBe(200)
      }
      const limited = await json(await signup(t, "member21@corp.example", "192.0.2.250"))
      expect(limited.status).toBe(429)
      expect(limited.headers.get("retry-after")).toBe("86400")
    } finally {
      await t.close()
    }
  }, 90_000)

  it("ignores X-Forwarded-For unless the proxy is trusted", async () => {
    const t = await createTestApp()
    try {
      // Every attempt comes from the same socket, so the per-IP limit applies to all of them.
      for (let i = 1; i <= 5; i++) {
        expect((await signup(t, `spoof-${i}@example.com`, `10.0.0.${i}`)).status).toBe(200)
      }
      expect((await signup(t, "spoof-6@example.com", "10.0.0.99")).status).toBe(429)
    } finally {
      await t.close()
    }
  }, 60_000)
})
