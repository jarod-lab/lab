import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { mailLinkTo, pathAndQuery } from "./support/mail"
import { signOutUi, signUpUi } from "./support/invitations"

// The personal account profile (docs/build-app/boards/project/Profile): rename, change the sign-in email
// through the link sent to the new address, and see that deleting the account is blocked while the
// person owns an organization. Locators and the dev mail sink only. Desktop and phone run the same journey.

test("rename, change email through the link, and see deletion blocked by an owned organization", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = Date.now().toString(36)
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
  await expect(screen.getByText("You own Owned Ltd. Transfer or delete it first.")).toBeVisible()
  await expect(screen.getByRole("button", "Delete my account")).toBeDisabled()

  // The rest of the page: the sign-out path still works from the account menu.
  await signOutUi(ctx)
  await expect(browser).toHaveURL(/\/sign-in/)
})
