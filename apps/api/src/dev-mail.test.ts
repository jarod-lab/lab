// The dev mail sink (DEV_MAIL_SINK): auth emails are captured in memory and read back over
// GET /api/dev/mail. Unset, the route does not exist.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { BASE, createTestApp } from "./app.test.helpers"
import { createDevMailSink } from "./dev-mail"

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

  describe("Reply-To", () => {
    it("keeps the first Reply-To of a structured or a raw email, else empty", async () => {
      const sink = createDevMailSink()
      await sink.client.send({
        input: {
          Destination: { ToAddresses: ["ada@example.com"] },
          ReplyToAddresses: ["support+tok@support.example.com"],
          Message: { Subject: { Data: "[#1] Help" }, Body: { Text: { Data: "Fixed" } } },
        },
      })
      await sink.client.send({
        input: {
          Destinations: ["lin@example.com"],
          RawMessage: {
            Data: new TextEncoder().encode(
              "Subject: Raw\r\nReply-To: support+raw@support.example.com\r\n\r\nBody",
            ),
          },
        },
      })
      await sink.client.send({
        input: { Destination: { ToAddresses: ["kim@example.com"] }, Message: {} },
      })
      expect(sink.messages("ada@example.com")[0]?.replyTo).toBe("support+tok@support.example.com")
      expect(sink.messages("lin@example.com")[0]?.replyTo).toBe("support+raw@support.example.com")
      expect(sink.messages("kim@example.com")[0]?.replyTo).toBe("")
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
