import { inbox } from "@byo-oss/notifications"
import { describe, expect, it } from "vitest"

import { notificationEmailChannel, withDeliveryIndexes } from "./notification-email"

const BASE = "http://localhost:3000"

function fakeSes() {
  const sent: { to: string; subject: string; raw: string }[] = []
  const client = {
    send: async (command: { input: unknown }) => {
      const raw = JSON.stringify(command.input)
      const input = command.input as { Destination?: { ToAddresses?: string[] } }
      sent.push({
        to: input.Destination?.ToAddresses?.[0] ?? "",
        subject: /"Subject":\{"Data":"([^"]*)"/.exec(raw)?.[1] ?? "",
        raw,
      })
      return { MessageId: `test-${sent.length}`, $metadata: { requestId: "test" } }
    },
  }
  return { client, sent }
}

const context = (href: string | null) => ({
  notification: {
    id: "n1",
    userId: "u1",
    type: "billing.payment_failed",
    title: "Payment failed",
    body: "Update the card for Acme.",
    href,
    read: false,
    createdAt: new Date(),
  },
  user: {
    id: "u1",
    email: "ada@example.com",
    name: "Ada",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  appUrl: BASE,
})

describe("notificationEmailChannel", () => {
  it("sends the notification in the auth emails' layout, linking to the app", async () => {
    const ses = fakeSes()
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: { client: ses.client },
    })
    await channel.deliver(context("/acme/settings/billing"))

    expect(ses.sent).toHaveLength(1)
    expect(ses.sent[0]).toMatchObject({ to: "ada@example.com", subject: "Payment failed" })
    expect(ses.sent[0]?.raw).toContain("Update the card for Acme.")
    expect(ses.sent[0]?.raw).toContain(`${BASE}/acme/settings/billing`)
  })

  it("leaves the button out when the notification has no link", async () => {
    const ses = fakeSes()
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: { client: ses.client },
    })
    await channel.deliver({ ...context(null), appUrl: undefined })
    expect(ses.sent[0]?.raw).not.toContain("Open")
  })

  it("lets an SES failure through, so the delivery is retried", async () => {
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: {
        client: {
          send: async () => {
            throw Object.assign(new Error("Throttling"), {
              name: "Throttling",
              $metadata: { requestId: "r" },
            })
          },
        },
      },
    })
    const failure = channel.deliver(context("/x"))
    await expect(failure).rejects.toThrow()
    const error = await failure.catch((e: unknown) => e)
    expect((error as { permanent?: unknown }).permanent).not.toBe(true)
  })

  it("sends a non-ASCII display name in From RFC 2047 encoded", async () => {
    const ses = fakeSes()
    const channel = notificationEmailChannel({
      from: "Zoë <auth@example.com>",
      appName: "Acme",
      ses: { client: ses.client },
    })
    await channel.deliver(context("/x"))

    const source = /"Source":"([^"]*)"/.exec(ses.sent[0]?.raw ?? "")?.[1] ?? ""
    expect(source).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/]+=*\?= <auth@example\.com>$/)
    const encoded = source.slice("=?UTF-8?B?".length, source.indexOf("?="))
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe("Zoë")
  })

  it("rejects an invalid recipient address as permanent, without calling SES", async () => {
    const ses = fakeSes()
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: { client: ses.client },
    })
    const ctx = context("/x")
    const failure = channel.deliver({ ...ctx, user: { ...ctx.user, email: "not an address" } })

    await expect(failure).rejects.toMatchObject({ permanent: true })
    expect(ses.sent).toHaveLength(0)
  })

  it("rejects an SES MessageRejected as permanent", async () => {
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: {
        client: {
          send: async () => {
            throw Object.assign(new Error("Illegal address"), {
              name: "MessageRejected",
              $metadata: { requestId: "r" },
            })
          },
        },
      },
    })
    await expect(channel.deliver(context("/x"))).rejects.toMatchObject({ permanent: true })
  })

  it("rejects an SES InvalidParameterValue as permanent", async () => {
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: {
        client: {
          send: async () => {
            throw Object.assign(new Error("Invalid parameter"), {
              name: "InvalidParameterValue",
              $metadata: { requestId: "r" },
            })
          },
        },
      },
    })
    await expect(channel.deliver(context("/x"))).rejects.toMatchObject({ permanent: true })
  })

  it("lets an unverified identity through as a retried sandbox error, not permanent", async () => {
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: {
        client: {
          send: async () => {
            throw Object.assign(
              new Error(
                "Email address is not verified. The following identities failed the check in region us-east-1: ada@example.com",
              ),
              { name: "MessageRejected", $metadata: { requestId: "r" } },
            )
          },
        },
      },
    })
    const failure = channel.deliver(context("/x"))
    await expect(failure).rejects.toMatchObject({ name: "SandboxError" })
    const error = await failure.catch((e: unknown) => e)
    expect((error as { permanent?: unknown }).permanent).not.toBe(true)
  })

  it("builds no AWS client until it delivers", async () => {
    const ses = fakeSes()
    let accessed = 0
    const sesOptions = {
      get client() {
        accessed += 1
        return ses.client
      },
    }
    const channel = notificationEmailChannel({
      from: "Test <auth@example.com>",
      appName: "Acme",
      ses: sesOptions,
    })
    expect(accessed).toBe(0)

    await channel.deliver(context("/x"))
    expect(accessed).toBeGreaterThan(0)
    expect(ses.sent).toHaveLength(1)
  })
})

describe("withDeliveryIndexes", () => {
  it("indexes the delivery queue and leaves the rest of the plugin alone", () => {
    const plugin = withDeliveryIndexes(inbox())
    expect(plugin.id).toBe("inbox")
    expect(Object.keys(plugin.endpoints)).toContain("processDeliveries")
    const delivery = plugin.schema.notificationDelivery as { indexes?: { fields: string[] }[] }
    expect(delivery.indexes?.map((i) => i.fields)).toEqual([
      ["status", "scheduledFor"],
      ["userId", "type", "channel", "sentAt"],
    ])
    expect(Object.keys(plugin.schema.notificationDelivery.fields)).toContain("scheduledFor")
  })
})
