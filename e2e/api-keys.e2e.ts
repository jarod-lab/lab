import { test } from "@e2e-dev/web"
import { expect } from "e2e"

// The organization's API keys (docs/build-app/boards/project/OrgApiKeys): an owner creates a key, sees
// its secret once, copies it, and revokes it; the list follows. Locators only, runs on desktop and
// phone. The secret is never read back (secret values are redacted in e2e), only its outcome is asserted.

const PASSWORD = "correct horse battery staple 42"

test("owner creates an API key, sees the secret once, and revokes it", async ({
  app,
  screen,
  browser,
}) => {
  const unique = Date.now().toString(36)
  const email = `ada.${unique}@example.com`
  const slug = `keys-${unique}`

  await app.open("/sign-up")
  await screen.getByLabel("Name").fill("Ada Lovelace")
  await screen.getByLabel("Work email").fill(email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Create account").tap()
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+\/settings\/agents$/)

  // An organization of our own, so the page's slug is known and reruns don't clash.
  await app.open("/new")
  await screen.getByLabel("Organization name").fill("Keys Ltd")
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  // G then O opens the organization's settings on General; the API keys tab is one click away.
  await browser.keyboard.press("g")
  await browser.keyboard.press("o")
  await expect(browser).toHaveURL(new RegExp(`/${slug}/settings/general$`))
  await screen.getByRole("link", "API keys").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}/settings/api-keys$`))
  await expect(screen.getByRole("heading", "API keys")).toBeVisible()
  await expect(screen.getByRole("heading", "No API keys yet")).toBeVisible()

  // Create: the name is required, the default permission is read on projects.
  await screen.getByRole("button", "Create API key").tap()
  const dialog = screen.getByRole("dialog")
  await dialog.getByRole("button", "Create key").tap()
  await expect(dialog.getByText("Give the key a name", { exact: false })).toBeVisible()
  await dialog.getByLabel("Name").fill("CI deploy")
  await dialog.getByRole("button", "Create key").tap()

  // The secret is shown once, with a clear notice.
  await expect(
    screen.getByRole("heading", "Copy “CI deploy” now. You won't see this key again."),
  ).toBeVisible()
  await expect(screen.getByLabel("Secret key")).toBeVisible()
  await screen.getByRole("button", "Copy").tap()
  await expect(screen.getByRole("button", "I've saved it")).toBeVisible()

  // Saved: the secret goes away and the key is in the list.
  await screen.getByRole("button", "I've saved it").tap()
  await expect(screen.getByLabel("Secret key")).toBeHidden()
  await expect(screen.getByRole("cell", "CI deploy")).toBeVisible()

  // Revoke: the dialog names the consequence; the list updates once it is confirmed.
  await screen.getByRole("button", "Revoke CI deploy").tap()
  const confirm = screen.getByRole("alertdialog")
  await expect(
    confirm.getByText("Agents using this key stop working immediately.", { exact: false }),
  ).toBeVisible()
  await confirm.getByRole("button", "Revoke key").tap()
  await expect(screen.getByRole("heading", "No API keys yet")).toBeVisible()

  // A fresh visit shows the same list: nothing about the secret comes back.
  await app.open(`/${slug}/settings/api-keys`)
  await expect(screen.getByRole("heading", "No API keys yet")).toBeVisible()
  await expect(screen.getByLabel("Secret key")).toBeHidden()
})
