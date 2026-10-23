// The email half of notifications: @byo-oss/notifications' mailer channel, sent through the user's own SES
// with Wraps like the auth emails (authMailer, mailer.ts), in the same layout. Which events email, and when,
// is NOTIFICATION_EMAIL_ROUTES in notifications.ts; the API process sends them (support-sweep.ts, `sweepAll`).
// The mailer sorts failures: an SDK ValidationError, or an SES MessageRejected or InvalidParameterValue,
// fails the delivery at once. Throttling, network errors and an unverified identity (the SDK's
// SandboxError) retry.
import { renderLayout, type WrapsSesOptions } from "@wraps.dev/better-auth"
import type { InboxChannel, inbox } from "@byo-oss/notifications"
import { mailerChannel, notificationUrl } from "@byo-oss/notifications/mailer"

import { authMailer } from "./mailer"

export interface NotificationEmailOptions {
  /** "Name <addr@domain>", the auth emails' sender. */
  from: string
  appName: string
  /** The auth emails' SES options, so a test's fake client gets these too. */
  ses?: WrapsSesOptions
}

export function notificationEmailChannel(opts: NotificationEmailOptions): InboxChannel {
  return mailerChannel({
    mailer: authMailer({ from: opts.from, ses: opts.ses }),
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
