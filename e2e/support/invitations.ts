import type { Browser } from "@e2e-dev/web"
import type { App, Screen } from "e2e"
import { expect } from "e2e"

// Shared by the journeys that invite someone: the owner invites through the Members page, the invitee
// opens the link from the invitation email in a session of their own, and accepts. Not a test file
// (no `.e2e.ts` suffix), so the runner doesn't collect it.

export const PASSWORD = "correct horse battery staple 42"

export interface Ctx {
  app: App
  screen: Screen
  browser: Browser
}

/** The invitation link for `email` from the dev mail sink (GET /api/dev/mail), or null until one arrives. */
export async function inviteLinkFor(app: App, email: string): Promise<string | null> {
  if (!app.baseUrl) throw new Error("the app has no base URL")
  const response = await fetch(
    new URL(`/api/dev/mail?to=${encodeURIComponent(email)}`, app.baseUrl),
  )
  const body = (await response.json()) as { messages: { links: string[] }[] }
  const links = body.messages.flatMap((message) => message.links)
  return links.find((link) => /\/(accept-invitation|invite)\//.test(link)) ?? null
}

/** The path and query of a link, so the browser opens it on the app's own origin. */
export function pathOf(link: string): string {
  const url = new URL(link)
  return `${url.pathname}${url.search}`
}

const ROLE_LABEL = { admin: "Admin", member: "Member", viewer: "Viewer" } as const

/**
 * As the signed-in owner: invites `email` on the organization's Members page with `role` (the form's
 * default when omitted), waits for the invitation row, and returns the link from the invitation email.
 */
export async function inviteAs(
  { app, screen }: Ctx,
  options: { slug: string; email: string; role?: keyof typeof ROLE_LABEL },
): Promise<string> {
  await app.open(`/${options.slug}/settings/members`)
  await screen.getByLabel("Invite by email").fill(options.email)
  // The select's options are labelled "Admin"/"Member"/"Viewer"; a bare string matches the visible label.
  if (options.role) await screen.getByLabel("Role").selectOption(ROLE_LABEL[options.role])
  await screen.getByRole("button", "Send invites").tap()
  const label = ROLE_LABEL[options.role ?? "member"]
  await expect(screen.getByText(`${options.email} · ${label}`)).toBeVisible()
  await expect.poll(() => inviteLinkFor(app, options.email)).not.toBeNull()
  const link = await inviteLinkFor(app, options.email)
  if (!link) throw new Error(`no invitation email reached ${options.email}`)
  return link
}

/**
 * At phone width the sidebar is a drawer: open it from the top bar when the account menu at its foot is
 * hidden (the same reveal the app-shell journey uses).
 */
async function openAccountMenu(screen: Screen) {
  const trigger = screen.getByRole("button", /^Account menu/)
  try {
    await expect(trigger).toBeVisible({ timeout: 2_000 })
  } catch {
    await screen.getByRole("button", "Open navigation").tap()
  }
  await trigger.tap()
}

/** Signs out through the account menu at the foot of the sidebar. */
export async function signOutUi({ screen }: Ctx) {
  await openAccountMenu(screen)
  await screen.getByRole("menuitem", "Sign out").tap()
}

/** Creates an account from /sign-up and waits for its personal organization to open. */
export async function signUpUi({ app, screen, browser }: Ctx, name: string, email: string) {
  await app.open("/sign-up")
  await screen.getByLabel("Name").fill(name)
  await screen.getByLabel("Work email").fill(email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Create account").tap()
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+\/settings\/agents$/)
}

/** Signs in with an existing account. */
export async function signInUi({ app, screen, browser }: Ctx, email: string) {
  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Sign in with email").tap()
  await expect(browser).not.toHaveURL(/\/sign-in/)
}

/**
 * Opens the invitation link as a new person: creates their account (the invitation page signs them up
 * with the invited address), then accepts. Their session is their own; the caller signs out first.
 */
export async function acceptInvitationAs(
  ctx: Ctx,
  options: { link: string; name: string; email: string; organizationName: string },
) {
  const { app, screen } = ctx
  await app.open(pathOf(options.link))
  await screen.getByRole("button", "Create an account").tap()
  await screen.getByLabel("Name").fill(options.name)
  // The invitation locks the address to the invited one (read-only), so check it rather than fill it.
  await expect(screen.getByLabel("Email")).toHaveValue(options.email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Create account").tap()
  await screen.getByRole("button", "Accept").tap()
  // The accepted state renders in place: the URL stays on the invitation link.
  await expect(screen.getByRole("heading", "You have joined")).toBeVisible()
  await expect(
    screen.getByText(`You are now a member of ${options.organizationName}.`),
  ).toBeVisible()
}
