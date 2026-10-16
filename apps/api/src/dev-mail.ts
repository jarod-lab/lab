// Dev and e2e only (DEV_MAIL_SINK=true, refused in production by packages/env): auth emails are kept in
// memory instead of being sent, and GET /api/dev/mail reads them back. An e2e run follows a magic link
// or a reset through this, since it has no inbox. The sink stands where SES does: the Wraps plugin
// calls `client.send` with the SES v2-style commands it would send, so nothing else changes.
import type { Context } from "hono"

/** A captured auth email, as a test or e2e run reads it back. */
export interface DevMailMessage {
  to: string
  subject: string
  text: string
  html: string
  /** Every http(s) link in the email, in order, with `&amp;` decoded. */
  links: string[]
  sentAt: string
}

export interface DevMailSink {
  /** Pass as the auth `ses` option: `{ client }`. Never reaches AWS. */
  client: { send: (command: { input: unknown }) => Promise<unknown> }
  /** Newest first. `to` matches the address case-insensitively. */
  messages: (to?: string) => DevMailMessage[]
}

/** Keep this many messages; older ones drop off. Enough for one e2e run, not a mailbox. */
const CAPACITY = 100

const LINK = /https?:\/\/[^\s"'<>\\]+/g

const text = (value: unknown) => (typeof value === "string" ? value : "")

/** The fields we keep from a SendEmail (structured) or SendRawEmail (MIME) command. */
function capture(input: unknown): Omit<DevMailMessage, "sentAt"> {
  const raw = (input ?? {}) as Record<string, unknown>
  const destination = raw.Destination as { ToAddresses?: string[] } | undefined
  const destinations = raw.Destinations as string[] | undefined
  const message = raw.Message as
    | {
        Subject?: { Data?: unknown }
        Body?: { Html?: { Data?: unknown }; Text?: { Data?: unknown } }
      }
    | undefined
  const rawMessage = raw.RawMessage as { Data?: unknown } | undefined

  if (rawMessage) {
    const mime =
      typeof rawMessage.Data === "string"
        ? rawMessage.Data
        : new TextDecoder().decode(rawMessage.Data as Uint8Array)
    const subject = /^Subject: (.*)$/m.exec(mime)?.[1]?.trim() ?? ""
    const body = mime.slice(mime.indexOf("\r\n\r\n") + 4)
    return {
      to: destinations?.[0] ?? "",
      subject,
      text: body,
      html: "",
      links: [...new Set(body.match(LINK) ?? [])],
    }
  }

  const html = text(message?.Body?.Html?.Data)
  const plain = text(message?.Body?.Text?.Data)
  const links = `${html} ${plain}`.match(LINK) ?? []
  return {
    to: destination?.ToAddresses?.[0] ?? "",
    subject: text(message?.Subject?.Data),
    text: plain,
    html,
    links: [...new Set(links.map((l) => l.replaceAll("&amp;", "&")))],
  }
}

export function createDevMailSink(): DevMailSink {
  const stored: DevMailMessage[] = []
  return {
    client: {
      send: async (command) => {
        stored.unshift({ ...capture(command.input), sentAt: new Date().toISOString() })
        stored.splice(CAPACITY)
        return { MessageId: `dev-${stored.length}`, $metadata: { requestId: "dev-mail" } }
      },
    },
    messages: (to) => {
      const wanted = to?.trim().toLowerCase()
      return stored.filter((m) => !wanted || m.to.toLowerCase() === wanted)
    },
  }
}

/** GET /api/dev/mail?to=<address>: the captured messages as JSON, newest first. */
export const devMailRoute =
  (sink: DevMailSink) =>
  (c: Context): Response => {
    const to = c.req.query("to")
    return c.json({ messages: sink.messages(to) }, 200, { "cache-control": "no-store" })
  }
