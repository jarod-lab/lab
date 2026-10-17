import type { App } from "e2e"

// Auth email from the dev mail sink (GET /api/dev/mail?to=, DEV_MAIL_SINK). Not a test file.

interface MailBody {
  messages: { links: string[] }[]
}

/** Every link in the mail sent to `to`, oldest first. Empty until something arrives. */
export async function mailLinksTo(app: App, to: string): Promise<string[]> {
  if (!app.baseUrl) throw new Error("the app has no base URL")
  const response = await fetch(new URL(`/api/dev/mail?to=${encodeURIComponent(to)}`, app.baseUrl))
  const body = (await response.json()) as MailBody
  return body.messages.flatMap((message) => message.links)
}

/** The first link in mail to `to` that matches `pattern`, or null. */
export async function mailLinkTo(app: App, to: string, pattern: RegExp): Promise<string | null> {
  return (await mailLinksTo(app, to)).find((link) => pattern.test(link)) ?? null
}

/** The path and query of a link, so the browser opens it on the app's own origin. */
export function pathAndQuery(link: string): string {
  const url = new URL(link)
  return `${url.pathname}${url.search}`
}
