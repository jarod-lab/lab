// A mailer on the auth emails' SES options: @byo-oss/mailer's Wraps adapter. Support's thread mail
// (support.ts) and the notification email (notification-email.ts) both send through it. The auth emails
// themselves (verification, reset) are sent by @wraps.dev/better-auth, not by this.
import type { Mailer } from "@byo-oss/mailer"
import { wrapsMailer } from "@byo-oss/mailer/wraps"
import type { WrapsSesOptions } from "@wraps.dev/better-auth"
import { WrapsEmail } from "@wraps.dev/email"

/**
 * Mail through Wraps on the auth emails' SES options: the dev mail sink's client, the tests' fake, or
 * the default AWS client. The Wraps client is made on the first send, so building this needs no AWS
 * credentials. `wrapsMailer` maps SES errors to retry or permanent failure.
 */
export function authMailer({ from, ses }: { from: string; ses?: WrapsSesOptions }): Mailer {
  let client: WrapsEmail | undefined
  // The sink and the fake have the one method WrapsEmail calls; its type asks for the full client.
  type Config = NonNullable<ConstructorParameters<typeof WrapsEmail>[0]>
  return wrapsMailer({
    from,
    client: {
      send: (params) => {
        client ??= new WrapsEmail(ses as Config | undefined)
        return client.send(params)
      },
    },
  })
}
