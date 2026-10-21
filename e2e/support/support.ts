import { generateKeyPairSync, randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import type { Browser } from "@e2e-dev/web"
import type { App, Locator, Screen } from "e2e"
import { credentials, expect } from "e2e"

import { PASSWORD } from "./invitations"
import { mailLinkTo } from "./mail"
import { DKIM_DIR, STACKS_DIR } from "./support-stack"
import { uniqueId } from "./unique"

// Shared by the support journeys (e2e/support-*.e2e.ts): people made over the API, sessions swapped
// on the browser, support's own endpoints for setup and checks, and the widget and queue as a person
// finds them. Not a test file.

export interface Cookie {
  name: string
  value: string
}

export interface Person {
  name: string
  email: string
  userId: string
  /** Their personal organization's slug. */
  slug: string
  cookies: Cookie[]
}

const baseOf = (app: App): string => {
  if (!app.baseUrl) throw new Error("the app has no base URL")
  return app.baseUrl
}

export const cookieHeader = (cookies: Cookie[]) =>
  cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")

const setCookies = (response: Response): Cookie[] =>
  response.headers.getSetCookie().map((line) => {
    const [pair = ""] = line.split(";")
    const at = pair.indexOf("=")
    return { name: pair.slice(0, at), value: pair.slice(at + 1) }
  })

/** A JSON call as `cookies`, with the Origin better-auth checks. Throws on an error status. */
export async function api<T = unknown>(
  app: App,
  cookies: Cookie[],
  path: string,
  body?: unknown,
): Promise<T> {
  const base = baseOf(app)
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? "GET" : "POST",
    headers: { origin: base, "content-type": "application/json", cookie: cookieHeader(cookies) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  return (await response.json()) as T
}

/** The same call, answering the status instead of throwing (for "it's gone" checks). */
export async function apiStatus(app: App, cookies: Cookie[], path: string): Promise<number> {
  const base = baseOf(app)
  const response = await fetch(new URL(path, base), {
    headers: { origin: base, cookie: cookieHeader(cookies) },
  })
  return response.status
}

/**
 * Signs a person up over the API (as another browser would) and, unless `verified` is false, opens
 * the verification link from the mail sink: thread mail goes only to a verified address.
 */
export async function signUpPerson(
  app: App,
  name: string,
  {
    email = `${name.split(" ")[0]?.toLowerCase()}.${uniqueId()}@example.com`,
    verified = true,
  } = {},
): Promise<Person> {
  const base = baseOf(app)
  const response = await fetch(new URL("/api/auth/sign-up/email", base), {
    method: "POST",
    headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  })
  if (!response.ok) throw new Error(`sign-up failed: ${response.status} ${await response.text()}`)
  const { user } = (await response.json()) as { user: { id: string } }
  const cookies = setCookies(response)
  const [personal] = await api<{ slug: string }[]>(app, cookies, "/api/auth/organization/list")
  if (!personal) throw new Error("sign-up made no personal organization")
  if (verified) {
    await api(app, cookies, "/api/auth/send-verification-email", { email, callbackURL: "/" })
    await expect.poll(() => mailLinkTo(app, email, /verify-email\?token=/)).not.toBeNull()
    const link = await mailLinkTo(app, email, /verify-email\?token=/)
    const verify = await fetch(link ?? "", { redirect: "manual" })
    if (verify.status >= 400) throw new Error(`email verification failed: ${verify.status}`)
  }
  return { name, email, userId: user.id, slug: personal.slug, cookies }
}

/** Creates an organization as `owner` and returns its id. */
export async function createOrganization(app: App, owner: Person, name: string, slug: string) {
  const org = await api<{ id: string }>(app, owner.cookies, "/api/auth/organization/create", {
    name,
    slug,
  })
  return org.id
}

/** `owner` invites `member` to the organization, and `member` accepts, all over the API. */
export async function addMember(
  app: App,
  owner: Cookie[],
  member: Person,
  organizationId: string,
  role: "member" | "admin" = "member",
) {
  const invitation = await api<{ id: string }>(app, owner, "/api/auth/organization/invite-member", {
    email: member.email,
    role,
    organizationId,
  })
  await api(app, member.cookies, "/api/auth/organization/accept-invitation", {
    invitationId: invitation.id,
  })
}

/** Makes the browser `cookies`' session (it replaces whoever was signed in). */
export async function actAs(browser: Browser, app: App, cookies: Cookie[]) {
  const url = baseOf(app)
  await browser.setCookies(cookies.map((cookie) => ({ ...cookie, url })))
}

/**
 * Signs the browser in as the `admin` credential, who owns the operator organization the stack seeds
 * (support staff), and returns the session's cookies for API checks and later swaps.
 */
export async function signInAdmin({
  app,
  screen,
  browser,
}: {
  app: App
  screen: Screen
  browser: Browser
}): Promise<Cookie[]> {
  const admin = credentials.user("admin")
  // A session cookie of someone else would send /sign-in onwards: drop it first.
  await actAs(browser, app, [{ name: "better-auth.session_token", value: "signed-out" }])
  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(admin.username)
  await screen.getByLabel("Password").fill(admin.password)
  await screen.getByRole("button", "Sign in with email").tap()
  await expect(browser).not.toHaveURL(/\/sign-in|\/two-factor/)
  return (await browser.cookies()).map(({ name, value }) => ({ name, value }))
}

// --- support's endpoints, for setup and checks ---------------------------------------------------

export interface CustomerTicket {
  id: string
  number: number
  subject: string
  status: string
  rating: string | null
  visibility: string
}

export interface AgentTicket {
  id: string
  number: number
  status: string
  priority: string | null
  assigneeId: string | null
  userId: string | null
  requester: { email?: string | null } | null
  tags: string[]
}

/** Opens a ticket as `person` through support's API (the widget's own call). */
export async function openTicketApi(
  app: App,
  person: Person,
  subject: string,
  options: { body?: string; organizationId?: string } = {},
): Promise<CustomerTicket> {
  const { ticket } = await api<{ ticket: CustomerTicket }>(
    app,
    person.cookies,
    "/api/auth/support/create-ticket",
    {
      subject,
      body: options.body ?? `About: ${subject}`,
      ...(options.organizationId && { organizationId: options.organizationId }),
    },
  )
  return ticket
}

/** The ticket and its messages as the customer sees them. */
export async function customerThread(app: App, person: Person, id: string) {
  return api<{ ticket: CustomerTicket; messages: { body: string }[] }>(
    app,
    person.cookies,
    `/api/auth/support/ticket?id=${encodeURIComponent(id)}`,
  )
}

/** The ticket as staff see it. */
export async function agentTicket(app: App, staff: Cookie[], id: string) {
  const { ticket } = await api<{ ticket: AgentTicket }>(
    app,
    staff,
    `/api/auth/support/agent/ticket?id=${encodeURIComponent(id)}`,
  )
  return ticket
}

// --- mail in and out ----------------------------------------------------------------------------

interface SinkMessage {
  subject: string
  text: string
  links: string[]
  replyTo: string
}

interface Stack {
  web: string
  api: string
  inboundSecret: string
}

/** Every running stack, as each wrote itself down (scripts/e2e-stack.mjs). */
function stacks(): Stack[] {
  try {
    return readdirSync(STACKS_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(join(STACKS_DIR, name), "utf8")) as Stack)
  } catch {
    return []
  }
}

/** This target's stack: the one serving `app`. */
function stackOf(app: App): Stack {
  const port = new URL(baseOf(app)).port
  const stack = stacks().find((entry) => new URL(entry.web).port === port)
  if (!stack) throw new Error(`no e2e stack wrote itself down for ${baseOf(app)}`)
  return stack
}

/** Every mail sink: this target's app first, then every stack's API. */
const mailSinks = (app: App): string[] => [baseOf(app), ...stacks().map((stack) => stack.api)]

/**
 * Thread mail to `to` about ticket `number`, or null until it arrives. Support's sweep sends it, and
 * the targets' stacks share the database, so it may be in either stack's mail sink.
 */
export async function threadMail(app: App, to: string, number: number) {
  for (const sink of mailSinks(app)) {
    try {
      const response = await fetch(new URL(`/api/dev/mail?to=${encodeURIComponent(to)}`, sink))
      const { messages } = (await response.json()) as { messages: SinkMessage[] }
      const mail = messages.find((message) => message.subject.startsWith(`[#${number}]`))
      if (mail) return mail
    } catch {
      // A stack that has stopped: its entry outlived it.
    }
  }
  return null
}

// mailauth is support's own dependency (its DKIM check), not the suite's: load it from there.
const appRequire = createRequire(join(process.cwd(), "apps", "app", "package.json"))
const { dkimSign } = createRequire(appRequire.resolve("@byo-oss/support"))("mailauth") as {
  dkimSign(
    input: string,
    options: {
      canonicalization: string
      signatureData: { signingDomain: string; selector: string; privateKey: string }[]
    },
  ): Promise<{ signatures: string; errors: unknown[] }>
}

/** A plain-text RFC 822 message, as a mail client would send it. */
export function rawMessage(mail: { from: string; to: string; subject: string; text: string }) {
  const domain = mail.from.slice(mail.from.indexOf("@") + 1)
  return [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    mail.text,
    "",
  ].join("\r\n")
}

/**
 * Signs `raw` with a fresh DKIM key for its sender's domain, published where the stack's DNS
 * preload answers from (scripts/e2e-dkim-dns.mjs), as the sender's mail provider would.
 */
export async function dkimSigned(raw: string, from: string): Promise<string> {
  const domain = from.slice(from.indexOf("@") + 1)
  const selector = `e2e${uniqueId()}`
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const p = publicKey.export({ type: "spki", format: "der" }).toString("base64")
  mkdirSync(DKIM_DIR, { recursive: true })
  writeFileSync(join(DKIM_DIR, `${selector}.txt`), `v=DKIM1; k=rsa; p=${p}`)
  const result = await dkimSign(raw, {
    canonicalization: "relaxed/relaxed",
    signatureData: [
      {
        signingDomain: domain,
        selector,
        privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      },
    ],
  })
  if (result.errors.length > 0) throw new Error(`DKIM signing failed: ${String(result.errors)}`)
  return result.signatures + raw
}

/** Posts a raw message to support's inbound endpoint as the relay does; returns the status. */
export async function relayInbound(app: App, raw: string): Promise<number> {
  const response = await fetch(new URL("/api/auth/support/inbound", baseOf(app)), {
    method: "POST",
    headers: {
      "content-type": "message/rfc822",
      authorization: `Bearer ${stackOf(app).inboundSecret}`,
    },
    body: raw,
  })
  return response.status
}

// --- the widget and the queue on screen ---------------------------------------------------------

/** The top bar's support launcher. */
export const launcher = (screen: Screen) => screen.getByRole("button", "Support")

/** The widget's popover panel. */
export const supportPanel = (screen: Screen) => screen.getByRole("dialog", "Support")

/** Opens the top bar's widget. */
export async function openWidget(screen: Screen): Promise<Locator> {
  await launcher(screen).tap()
  const panel = supportPanel(screen)
  await expect(panel).toBeVisible()
  return panel
}

/** In an open widget (popover or inline): a new ticket, which opens its thread. */
export async function newTicketInWidget(panel: Locator, subject: string, body: string) {
  await panel.getByRole("button", "New ticket").tap()
  await panel.getByLabel("Subject").fill(subject)
  await panel.getByLabel("Message").fill(body)
  await panel.getByRole("button", "Submit ticket").tap()
  await expect(panel.getByRole("heading", new RegExp(escape(subject)))).toBeVisible()
}

/** The support queue's own region (search, filters, rows). */
export const queue = (screen: Screen) => screen.getByRole("region", "Support queue")

/** A queue row's button, by subject. */
export const queueRow = (screen: Screen, subject: string) =>
  queue(screen).getByRole("button", new RegExp(escape(subject)))

/** An open ticket's thread (the region named after its subject). */
export const thread = (screen: Screen, subject: string) => screen.getByRole("region", subject)

/** A message in the open ticket's thread, by its text. */
export const message = (screen: Screen, subject: string, text: string) =>
  thread(screen, subject).getByRole("article").filter({ hasText: text })

/** The open ticket's details (status, priority, assignee, tags); a toggle below `lg`. */
export async function details(screen: Screen): Promise<Locator> {
  const aside = screen.getByRole("complementary", "Details")
  if (!(await aside.isVisible())) await screen.getByRole("button", "Details").tap()
  await expect(aside).toBeVisible()
  return aside
}

/** Back from a thread to the queue, where the two are one at a time (below `md`). */
export async function backToQueue(screen: Screen, subject: string) {
  const back = thread(screen, subject).getByRole("button", "Back")
  if (await back.isVisible()) await back.tap()
  await expect(queue(screen)).toBeVisible()
}

/** Opens a ticket from the queue by searching its subject. */
export async function openFromQueue(screen: Screen, subject: string) {
  await queue(screen).getByRole("searchbox").fill(subject)
  await queueRow(screen, subject).tap()
  await expect(thread(screen, subject)).toBeVisible()
}

/** Writes and sends a reply or an internal note in the open ticket. */
export async function sendFromQueue(
  screen: Screen,
  subject: string,
  kind: "Reply" | "Internal note",
  text: string,
) {
  const open = thread(screen, subject)
  // The radio itself is visually hidden behind its label's styling: pick it by its label.
  await open.getByText(kind, { exact: true }).tap()
  await expect(open.getByRole("radio", kind)).toBeChecked()
  await open.getByLabel("Write a message").fill(text)
  await open.getByRole("button", "Send").tap()
  await expect(message(screen, subject, text)).toBeVisible()
}

/** Whether the page is wider than the window (something overflows sideways). */
export const overflowsSideways = (browser: Browser) =>
  browser.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)

export interface Focused {
  tag: string
  text: string
  label: string
}

/**
 * Presses Tab (or Shift+Tab) until the focused element matches, reading only what has focus: its
 * tag, text and label. Fails after `max` presses, which is how a keyboard trap or an unreachable
 * control shows up.
 */
export async function tabTo(
  browser: Browser,
  matches: (el: Focused) => boolean,
  key: "Tab" | "Shift+Tab" = "Tab",
  max = 40,
) {
  const seen: string[] = []
  for (let i = 0; i < max; i++) {
    await browser.keyboard.press(key)
    const el = await browser.evaluate(() => {
      const e = document.activeElement as HTMLElement | null
      const labelled = e && "labels" in e ? (e as HTMLInputElement).labels?.[0] : null
      return {
        tag: e?.tagName ?? "",
        text: (e?.textContent ?? "").replace(/\s+/g, " ").trim(),
        label: (labelled?.textContent ?? e?.getAttribute("aria-label") ?? "").trim(),
      }
    })
    if (matches(el)) return
    seen.push(`${el.tag} ${el.label || el.text.slice(0, 30)}`)
  }
  throw new Error(`focus never reached the control; went through: ${seen.join(" > ")}`)
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
