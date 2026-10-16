// The dev mail sink (DEV_MAIL_SINK): auth emails are captured in memory and read back over
// GET /api/dev/mail. Unset, the route does not exist.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { BASE, createTestApp } from "./app.test.helpers"

describe("dev mail sink", () => {
  describe("enabled", () => {
    let t: Awaited<ReturnType<typeof createTestApp>>
    beforeAll(async () => {
      t = await createTestApp([], { devMail: true })
    })
    afterAll(() => t.close())

    it("captures a magic-link email and returns it, with its link, for the address", async () => {
      const address = "e2e-magic@example.com"
      const sent = await t.req("/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: address, callbackURL: "/" }),
      })
      expect(sent.status).toBe(200)

      const res = await t.req(`/api/dev/mail?to=${encodeURIComponent(address.toUpperCase())}`)
      expect(res.status).toBe(200)
      expect(res.headers.get("cache-control")).toBe("no-store")
      const { messages } = (await res.json()) as {
        messages: { to: string; subject: string; links: string[]; text: string }[]
      }
      expect(messages).toHaveLength(1)
      const [mail] = messages
      expect(mail?.to).toBe(address)
      expect(mail?.subject.length).toBeGreaterThan(0)
      const link = mail?.links.find((l) =>
        l.startsWith(`${BASE}/api/auth/magic-link/verify?token=`),
      )
      expect(link).toBeTruthy()
      expect(mail?.text).toContain(link ?? "")
    })

    it("returns nothing for an address that was never sent to", async () => {
      const res = await t.req("/api/dev/mail?to=nobody@example.com")
      expect(await res.json()).toEqual({ messages: [] })
    })

    it("keeps the fake SES outbox out of it: emails go to the sink, not to SES", async () => {
      expect(t.outbox).toHaveLength(0)
    })
  })

  describe("disabled", () => {
    let t: Awaited<ReturnType<typeof createTestApp>>
    beforeAll(async () => {
      t = await createTestApp()
    })
    afterAll(() => t.close())

    it("has no /api/dev/mail route at all", async () => {
      const res = await t.req("/api/dev/mail?to=user1@example.com")
      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ error: { code: "NOT_FOUND" } })
    })
  })
})
