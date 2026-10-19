import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { acceptInvitationAs, inviteAs, signOutUi, signUpUi } from "./support/invitations"
import { uniqueId } from "./support/unique"

// The organization's General settings (docs/build-app/boards/project/OrgGeneral): an owner renames the
// organization, changes its URL and lands on the new address, then deletes it by typing its name.
// Locators only. Needs the stack (see e2e.config.ts): the dev mail sink is not needed here.
// The viewer's read-only view is the second test: a viewer is invited from the Members page, accepts
// in their own session, and sees General without the controls that change it.

const PASSWORD = "correct horse battery staple 42"

test("owner renames the organization, changes its URL, and deletes it", async ({
  app,
  screen,
  browser,
}) => {
  const unique = uniqueId()
  const email = `grace.${unique}@example.com`
  const slug = `labs-${unique}`
  const renamedSlug = `${slug}-co`

  await app.open("/sign-up")
  await screen.getByLabel("Name").fill("Grace Hopper")
  await screen.getByLabel("Work email").fill(email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Create account").tap()
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+\/settings\/agents$/)

  // A second organization to own the settings journey. Its URL is set explicitly, so reruns don't clash.
  await app.open("/new")
  await screen.getByLabel("Organization name").fill("Labs Ltd")
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  // G then O goes to the organization's settings, which open on General.
  await browser.keyboard.press("g")
  await browser.keyboard.press("o")
  await expect(browser).toHaveURL(new RegExp(`/${slug}/settings/general$`))
  await expect(screen.getByRole("heading", "Organization settings")).toBeVisible()

  // Rename: Save changes is off until something changes, then saves in place.
  await expect(screen.getByRole("button", "Save changes")).toBeDisabled()
  await screen.getByLabel("Organization name").fill("Labs Company")
  await screen.getByRole("button", "Save changes").tap()
  await expect(screen.getByText("Labs Company · you are Owner")).toBeVisible()
  await expect(browser).toHaveURL(new RegExp(`/${slug}/settings/general$`))

  // Change the URL: the warning names the old address, and saving lands on the new one.
  await screen.getByLabel("URL").fill(renamedSlug)
  await expect(
    screen.getByText("Changing this breaks existing links", { exact: false }),
  ).toBeVisible()
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Save changes").tap()
  await expect(browser).toHaveURL(new RegExp(`/${renamedSlug}/settings/general$`))
  await expect(screen.getByLabel("URL")).toHaveValue(renamedSlug)

  // Delete: the button opens a dialog that stays closed until the name is typed exactly.
  await screen.getByRole("button", "Delete organization").tap()
  const dialog = screen.getByRole("alertdialog")
  const confirm = dialog.getByRole("button", "Delete organization")
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/to confirm/).fill("Labs Company")
  await expect(confirm).toBeEnabled()
  await confirm.tap()

  // Back on the personal organization, which is still there.
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+$/)
  await expect(browser).not.toHaveURL(new RegExp(`/${renamedSlug}`))
})

test("a viewer sees General read-only: no save, no danger zone", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const ownerEmail = `owen.${unique}@example.com`
  const viewerEmail = `vic.${unique}@example.com`
  const slug = `viewer-${unique}`
  const orgName = "Viewer Labs"

  await signUpUi(ctx, "Owen Ortiz", ownerEmail)
  await app.open("/new")
  await screen.getByLabel("Organization name").fill(orgName)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  const link = await inviteAs(ctx, { slug, email: viewerEmail, role: "viewer" })
  await signOutUi(ctx)
  await acceptInvitationAs(ctx, {
    link,
    name: "Vic Viewer",
    email: viewerEmail,
    organizationName: orgName,
  })

  await app.open(`/${slug}/settings/general`)
  await expect(screen.getByText(`You have view-only access to ${orgName}.`)).toBeVisible()
  await expect(screen.getByLabel("Organization name")).toBeDisabled()
  await expect(screen.getByRole("button", "Delete organization")).toBeHidden()
  // A viewer can always leave.
  await expect(screen.getByRole("button", "Leave organization")).toBeVisible()

  // The Members page is read-only for a viewer too: the list, but no invite form and no role menus.
  await app.open(`/${slug}/settings/members`)
  await expect(
    screen.getByText("Only owners and admins can invite and manage members."),
  ).toBeVisible()
  await expect(screen.getByLabel("Invite by email")).toBeHidden()
  await expect(screen.getByRole("button", /^Role for /)).toBeHidden()
  await expect(screen.getByRole("columnheader", "Two-factor")).toBeHidden()
})

// The organization's mark on this page is the large (size-12) square with the logo's <img> (or the first
// letter) inside it; the sidebar has a smaller mark of its own.
const MARK = '[data-slot="org-mark"].size-12'
const MARK_LOGO = '[data-slot="org-mark"].size-12 > img'

test("an owner uploads a logo, sees it render, and removes it back to the letter", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const email = `lena.${unique}@example.com`
  const slug = `logo-${unique}`
  // The natural width of the logo once the browser has loaded it, or 0 until then.
  const loadedWidth = () =>
    browser.evaluate((css: string) => {
      const img = document.querySelector<HTMLImageElement>(css)
      return img?.complete ? img.naturalWidth : 0
    }, MARK_LOGO)

  await signUpUi(ctx, "Lena Ortiz", email)
  await app.open("/new")
  await screen.getByLabel("Organization name").fill("Logo Works")
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  await app.open(`/${slug}/settings/general`)
  await expect(screen.getByRole("heading", "Organization settings")).toBeVisible()
  await expect(screen.getByRole("button", "Remove logo")).toBeHidden()
  await expect(browser.locator(MARK)).toHaveText("L")

  // Upload logo opens a hidden file input; the 128px square is set on the input itself.
  await browser.locator('input[type="file"]').setInputFiles("e2e/fixtures/logo.png")
  await expect(browser.locator(MARK_LOGO)).toBeVisible()
  await expect.poll(loadedWidth).toBe(128)
  await expect(screen.getByRole("button", "Remove logo")).toBeVisible()

  // Remove logo takes the image away and the first letter comes back.
  await screen.getByRole("button", "Remove logo").tap()
  await expect(browser.locator(MARK_LOGO)).toBeHidden()
  await expect(browser.locator(MARK)).toHaveText("L")
  await expect(screen.getByRole("button", "Upload logo")).toBeVisible()
})
