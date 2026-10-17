import { test } from "@e2e-dev/web"
import { type Screen, expect } from "e2e"

import { acceptInvitationAs, inviteAs, signOutUi, signInUi } from "./support/invitations"

// The organization's agents (docs/build-app/boards/project/DirLiftSettings): an owner creates a workspace
// agent, pins it so it shows in the sidebar, changes its permissions, invites a viewer; the viewer sees it
// read-only; the owner deletes it, and the list says so. Locators only, desktop and phone. At phone width
// the sidebar is a drawer, so the pinned list is opened from the top bar first.

const PASSWORD = "correct horse battery staple 42"

test("owner creates, pins, edits and deletes an agent; a viewer sees it read-only", async ({
  app,
  screen,
  browser,
}) => {
  const unique = Date.now().toString(36)
  const ownerEmail = `ada.${unique}@example.com`
  const viewerEmail = `grace.${unique}@example.com`
  const slug = `agents-${unique}`
  const orgName = `Agents Ltd ${unique}`

  await app.open("/sign-up")
  await screen.getByLabel("Name").fill("Ada Lovelace")
  await screen.getByLabel("Work email").fill(ownerEmail)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Create account").tap()
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+\/settings\/agents$/)

  // An organization of our own, so the page's slug is known and reruns don't clash.
  await app.open("/new")
  await screen.getByLabel("Organization name").fill(orgName)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  // G then A opens the agents page; nothing is configured yet. Wait for the org page to render first,
  // so the shortcut is listening (a chord pressed during the redirect can be lost).
  await expect(screen.getByRole("heading", new RegExp(orgName))).toBeVisible()
  await browser.keyboard.press("g")
  await browser.keyboard.press("a")
  await expect(browser).toHaveURL(new RegExp(`/${slug}/settings/agents$`))
  await expect(screen.getByRole("heading", "Agent permissions")).toBeVisible()
  await expect(screen.getByRole("heading", "No agents yet")).toBeVisible()
  await expect(
    screen.getByRole("region", "No agents yet").getByRole("link", "API keys"),
  ).toBeVisible()

  // Create: the name is required.
  await screen.getByRole("button", "Create agent").tap()
  const create = screen.getByRole("dialog")
  await create.getByRole("button", "Create agent").tap()
  await expect(create.getByText("Give the agent a name", { exact: false })).toBeVisible()
  await create.getByLabel("Name").fill("Release triage")
  await create.getByLabel("Description").fill("Groups release blockers")
  await create.getByRole("button", "Create agent").tap()
  await expect(screen.getByRole("button", "Release triage", { exact: false })).toBeVisible()
  await expect(screen.getByText("Idle")).toBeVisible()

  // Pin: the agent joins the sidebar's pinned list.
  await screen.getByRole("switch", "Pin Release triage to the sidebar").tap()
  await openNavigationIfHidden(screen)
  await expect(screen.getByRole("list", "Pinned agents")).toBeVisible()
  await expect(screen.getByRole("link", "Release triage", { exact: false })).toBeVisible()
  await browser.keyboard.press("Escape")

  // Edit: change the autonomy; the save bar counts the change, and saving clears it.
  await screen.getByRole("button", "Autonomous").tap()
  await expect(screen.getByText("1 unsaved change")).toBeVisible()
  await screen.getByRole("button", "Save changes").tap()
  await expect(screen.getByText("1 unsaved change")).toBeHidden()

  // Invite a viewer, then sign out and let them accept.
  const link = await inviteAs(
    { app, screen, browser },
    { slug, email: viewerEmail, role: "viewer" },
  )
  await signOutUi({ app, screen, browser })
  await acceptInvitationAs(
    { app, screen, browser },
    { link, name: "Grace Hopper", email: viewerEmail, organizationName: orgName },
  )

  // The viewer reads the agent, and every change control is off.
  await app.open(`/${slug}/settings/agents`)
  await expect(screen.getByRole("button", "Release triage", { exact: false })).toBeVisible()
  await expect(screen.getByRole("region", "View-only access")).toBeVisible()
  await expect(screen.getByRole("button", "Create agent")).toBeDisabled()
  await expect(screen.getByRole("switch", "Pin Release triage to the sidebar")).toBeDisabled()
  await expect(screen.getByRole("button", "Delete agent")).toBeDisabled()
  await signOutUi({ app, screen, browser })

  // The owner signs back in and deletes it. The dialog names the runs it removes.
  await signInUi({ app, screen, browser }, ownerEmail)
  await app.open(`/${slug}/settings/agents`)
  await screen.getByRole("button", "Delete agent").tap()
  const confirm = screen.getByRole("alertdialog")
  await expect(
    confirm.getByText("Deletes Release triage and its 0 runs and their history.", { exact: false }),
  ).toBeVisible()
  await confirm.getByRole("button", "Delete agent").tap()
  await expect(screen.getByRole("heading", "No agents yet")).toBeVisible()
})

/**
 * At phone width the sidebar is a drawer: open it from the top bar when its pinned list is hidden (the
 * same reveal the app-shell journey uses). The caller closes it with Escape.
 */
async function openNavigationIfHidden(screen: Screen) {
  const pinned = screen.getByRole("list", "Pinned agents")
  try {
    await expect(pinned).toBeVisible({ timeout: 2_000 })
  } catch {
    await screen.getByRole("button", "Open navigation").tap()
  }
}
