// The email half of notifications: @byo-oss/notifications' delivery channel, sent through the user's own SES
// with Wraps like the auth emails, in the same layout. Which events email, and when, is
// NOTIFICATION_EMAIL_ROUTES in notifications.ts; the API process sends them (delivery-sweep.ts).
import { renderLayout, type WrapsSesOptions } from "@wraps.dev/better-auth"
import { WrapsEmail } from "@wraps.dev/email"
import type { InboxChannel, inbox } from "@byo-oss/notifications"
import { notificationUrl, type WrapsEmailSender, wrapsEmail } from "@byo-oss/notifications/wraps"

export interface NotificationEmailOptions {
  /** "Name <addr@domain>", the auth emails' sender. */
  from: string
  appName: string
  /** The auth emails' `WrapsEmail` options, so a test's fake client gets these too. */
  ses?: WrapsSesOptions
}

export function notificationEmailChannel(opts: NotificationEmailOptions): InboxChannel {
  // Built on the first send, as @wraps.dev/better-auth does, so creating auth never touches AWS.
  // WrapsSesOptions types `client` structurally (a test fake has only `send`); the plugin passes the
  // same options to WrapsEmail untyped, so this does too.
  const config = (opts.ses ?? {}) as ConstructorParameters<typeof WrapsEmail>[0]
  let client: WrapsEmail | undefined
  const sender: WrapsEmailSender = {
    send: (params) => (client ??= new WrapsEmail(config)).send(params),
  }
  return wrapsEmail({
    from: opts.from,
    client: sender,
    render: (ctx) => {
      const { title, body } = ctx.notification
      const url = notificationUrl(ctx)
      const { html, text } = renderLayout({
        brand: {},
        appName: opts.appName,
        previewText: body ?? title,
        heading: title,
        paragraphs: body ? [body] : [],
        ...(url ? { action: { label: "Open", url } } : {}),
      })
      return { subject: title, html, text }
    },
  })
}

/**
 * Indexes for the delivery queue: the sweep reads due rows by status and time, and a throttled send
 * looks up the person's last email of that type. Kept out of the plugin call because @byo-oss/notifications'
 * schema type has no `indexes` field (as `withGrantIndexes` does for the OAuth plugin).
 */
export function withDeliveryIndexes(plugin: ReturnType<typeof inbox>): ReturnType<typeof inbox> {
  const deliveryIndexes = {
    indexes: [
      { name: "notificationDelivery_due_idx", fields: ["status", "scheduledFor"] },
      {
        name: "notificationDelivery_throttle_idx",
        fields: ["userId", "type", "channel", "sentAt"],
      },
    ],
  }
  const schema = plugin.schema
  return {
    ...plugin,
    schema: {
      ...schema,
      notificationDelivery: { ...schema.notificationDelivery, ...deliveryIndexes },
    },
  }
}
