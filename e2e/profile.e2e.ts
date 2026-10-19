import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { mailLinkTo, pathAndQuery } from "./support/mail"
import { signOutUi, signUpUi } from "./support/invitations"
import { uniqueId } from "./support/unique"

// The personal account profile (docs/build-app/boards/project/Profile): rename, change the sign-in email
// through the link sent to the new address, and see that deleting the account is blocked while the
// person owns an organization. Locators and the dev mail sink only. Desktop and phone run the same journey.

test("rename, change email through the link, and see deletion blocked by an owned organization", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const email = `ada.${unique}@example.com`
  const newEmail = `ada.new.${unique}@example.com`

  await signUpUi(ctx, "Ada Lovelace", email)

  // The account page is under the personal settings; /account lands on Profile.
  await app.open("/account")
  await expect(browser).toHaveURL(/\/account\/profile$/)
  await expect(screen.getByRole("heading", "Personal settings")).toBeVisible()

  // Rename: Save stays off until the name changes.
  await expect(screen.getByRole("button", "Save")).toBeDisabled()
  await screen.getByLabel("Name").fill("Ada King")
  await screen.getByRole("button", "Save").tap()
  await expect(screen.getByText("Saved.")).toBeVisible()

  // Change email: the new address gets the link; the current one stays until it is opened.
  await screen.getByRole("button", "Change email").tap()
  const dialog = screen.getByRole("dialog")
  await dialog.getByLabel("New email").fill(newEmail)
  await dialog.getByRole("button", "Send confirmation link").tap()
  // The pending block is the status that talks about the link (Saved. is a status too).
  const pending = screen.getByRole("status").filter({ hasText: "confirmation link" })
  await expect(pending.getByText(newEmail)).toBeVisible()
  await expect(
    pending.getByText(`Your email stays ${email} until you click it.`, { exact: false }),
  ).toBeVisible()

  // The link in the mail sink opens the API's confirmation and returns to the profile.
  await expect.poll(() => mailLinkTo(app, newEmail, /verify|change-email|token=/)).not.toBeNull()
  const link = await mailLinkTo(app, newEmail, /verify|change-email|token=/)
  if (!link) throw new Error(`no change-email link reached ${newEmail}`)
  await app.open(pathAndQuery(link))
  await expect(browser).toHaveURL(/\/account\/profile/)
  const emailSection = screen.getByRole("region", "Email")
  await expect(emailSection.getByText(newEmail)).toBeVisible()
  await expect(screen.getByRole("status").filter({ hasText: "confirmation link" })).toBeHidden()

  // Deletion is blocked while the person owns an organization: the page says which one.
  const slug = `owned-${unique}`
  await app.open("/new")
  await screen.getByLabel("Organization name").fill("Owned Ltd")
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  await app.open("/account/profile")
  // The sentence and its link are separate nodes in the Delete account block.
  const blocked = screen.getByRole("region", "Delete account")
  await expect(blocked.getByText("You own Owned Ltd.", { exact: true })).toBeVisible()
  await expect(blocked.getByRole("link", "Transfer or delete it first")).toBeVisible()
  await expect(screen.getByRole("button", "Delete my account")).toBeDisabled()

  // The rest of the page: the sign-out path still works from the account menu.
  await signOutUi(ctx)
  await expect(browser).toHaveURL(/\/sign-in/)
})

// The avatar circle is the square with the photo's <img> (or the initials) inside it.
const AVATAR = "span.size-16"
const AVATAR_PHOTO = "span.size-16 > img"

test("upload a photo, see it render, and use initials again", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const email = `lin.${unique}@example.com`
  // The natural width of the photo once the browser has loaded it, or 0 until then.
  const loadedWidth = () =>
    browser.evaluate((css: string) => {
      const img = document.querySelector<HTMLImageElement>(css)
      return img?.complete ? img.naturalWidth : 0
    }, AVATAR_PHOTO)

  await signUpUi(ctx, "Ada Lovelace", email)
  await app.open("/account/profile")
  await expect(screen.getByRole("heading", "Personal settings")).toBeVisible()
  await expect(screen.getByRole("button", "Use initials")).toBeHidden()
  await expect(browser.locator(AVATAR)).toHaveText("AL")

  // The Upload button opens a hidden file input; the file is set on the input itself.
  await browser.locator('input[type="file"]').setInputFiles("e2e/fixtures/logo.png")
  await expect(browser.locator(AVATAR_PHOTO)).toBeVisible()
  // Loaded means the browser fetched it from the store (the page's CSP allows it) and decoded it.
  await expect.poll(loadedWidth).toBe(128)

  // Use initials removes the photo and the initials come back.
  await screen.getByRole("button", "Use initials").tap()
  await expect(browser.locator(AVATAR_PHOTO)).toBeHidden()
  await expect(browser.locator(AVATAR)).toHaveText("AL")
  await expect(screen.getByRole("button", "Upload photo")).toBeVisible()
})
