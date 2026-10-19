// Account emails the wraps plugin doesn't send: a change-of-address confirmation (to the NEW address),
// a notice to the OLD address when a change is requested, and the account-deletion confirmation.
// They go out through the plugin's `emails.send`, on the same SES client, sender and `onError` as the
// other auth emails, so a failure is reported and never fails the request that caused it.
import { renderLayout, type WrapsAuthEmails } from "@wraps.dev/better-auth"

export interface NoticeOptions {
  appName: string
  /** The wraps plugin's `emails.send`. */
  send: WrapsAuthEmails["send"]
}

export interface Notices {
  /** Confirms a requested new address: the link there completes the change. */
  emailChangeConfirmation(input: {
    to: string
    oldEmail: string
    name?: string
    url: string
  }): Promise<void>
  /** Tells the current address that a change was requested ("in case this wasn't you"). */
  emailChangeRequested(input: { to: string; newEmail: string; name?: string }): Promise<void>
  /** The link that deletes the account, sent to the account's own address before anything is deleted. */
  deleteAccountConfirmation(input: { to: string; name?: string; url: string }): Promise<void>
  /** The first email of a passkey sign-up: the link proves the address, then a passkey is added. */
  passkeySignupLink(input: { to: string; name?: string; url: string }): Promise<void>
}

const greeting = (name?: string) => {
  const first = name?.trim().split(" ")[0]
  return first ? `Hi ${first},` : "Hi,"
}

export function createNotices(options: NoticeOptions): Notices {
  const send = (to: string, rendered: { subject: string; html: string; text: string }) =>
    options.send({ to, ...rendered })
  const app = options.appName

  return {
    async emailChangeConfirmation({ to, oldEmail, name, url }) {
      const { html, text } = renderLayout({
        brand: {},
        appName: app,
        previewText: `Confirm your new ${app} email address`,
        heading: "Confirm your new email address",
        paragraphs: [
          greeting(name),
          `Confirm this address to make it the sign-in email for your ${app} account. Until you confirm, your account stays on ${oldEmail}.`,
        ],
        action: { label: "Confirm new email address", url },
        footnote: "If you didn't ask for this, ignore this email and your address won't change.",
      })
      await send(to, { subject: `Confirm your new email address for ${app}`, html, text })
    },

    async emailChangeRequested({ to, newEmail, name }) {
      const { html, text } = renderLayout({
        brand: {},
        appName: app,
        previewText: `A new email address was requested for your ${app} account`,
        heading: "A new email address was requested",
        paragraphs: [
          greeting(name),
          `Someone asked to change the sign-in email for your ${app} account to ${newEmail}. Your address doesn't change until that new address is confirmed.`,
          "If that was you, there's nothing to do. If it wasn't, sign in and review your account, and change your password.",
        ],
      })
      await send(to, {
        subject: `A new email address was requested for your ${app} account`,
        html,
        text,
      })
    },

    async deleteAccountConfirmation({ to, name, url }) {
      const { html, text } = renderLayout({
        brand: {},
        appName: app,
        previewText: `Confirm deleting your ${app} account`,
        heading: "Confirm deleting your account",
        paragraphs: [
          greeting(name),
          `Deleting your ${app} account removes your sign-in methods, sessions, passkeys and connected accounts, and removes you from every organization. It can't be undone.`,
          "Nothing is deleted until you open the link below.",
        ],
        action: { label: "Delete my account", url },
        footnote: "If you didn't ask for this, ignore this email. Your account stays as it is.",
      })
      await send(to, { subject: `Confirm deleting your ${app} account`, html, text })
    },

    async passkeySignupLink({ to, name, url }) {
      const { html, text } = renderLayout({
        brand: {},
        appName: app,
        previewText: `Finish creating your ${app} account`,
        heading: "Finish creating your account",
        paragraphs: [
          greeting(name),
          `Open the link below to confirm this email address. Then you can add a passkey to sign in to ${app} without a password.`,
          "The link works once and expires in 30 minutes.",
        ],
        action: { label: "Confirm and continue", url },
        footnote:
          "If you didn't ask for this, ignore this email. No account is signed in until you open the link.",
      })
      await send(to, { subject: `Finish creating your ${app} account`, html, text })
    },
  }
}
