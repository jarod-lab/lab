import { inbox } from "better-inbox"
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
            throw new Error("Throttling")
          },
        },
      },
    })
    await expect(channel.deliver(context("/x"))).rejects.toThrow()
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
