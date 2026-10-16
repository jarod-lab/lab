import { test } from "@e2e-dev/web"
import { expect } from "e2e"

// The organization's General settings (docs/build-app/boards/project/OrgGeneral): an owner renames the
// organization, changes its URL and lands on the new address, then deletes it by typing its name.
// Locators only. Needs the stack (see e2e.config.ts): the dev mail sink is not needed here.
// Not covered yet: the viewer's read-only view. A viewer needs an invitation, and the Members page
// that sends it is not built (P3); it belongs in this file once that lands.

const PASSWORD = "correct horse battery staple 42"

test("owner renames the organization, changes its URL, and deletes it", async ({
  app,
  screen,
  browser,
}) => {
  const unique = Date.now().toString(36)
  const email = `grace.${unique}@example.com`
  const slug = `labs-${unique}`
  const renamedSlug = `${slug}-co`

  await app.open("/sign-up")
  await screen.getByLabel("Name").fill("Grace Hopper")
  await screen.getByLabel("Email").fill(email)
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
