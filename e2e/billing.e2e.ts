import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { acceptInvitationAs, inviteAs, signOutUi, signUpUi } from "./support/invitations"

// The Billing page (docs/build-app/boards/project/OrgBilling): with Stripe not configured the page runs on
// the fixture. The owner sees the sample-data labels and [PRICE], and every provider control is disabled
// with the reason, so nothing can be charged. A viewer (invited through the Members page) has no billing
// access and sees only a notice. Locators only; desktop and phone run the same journey.

test("owner sees sample billing with nothing to charge; a viewer is told billing isn't theirs", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = Date.now().toString(36)
  const ownerEmail = `ada.${unique}@example.com`
  const viewerEmail = `vic.${unique}@example.com`
  const slug = `billing-${unique}`
  const orgName = "Billing Ltd"

  await signUpUi(ctx, "Ada Lovelace", ownerEmail)
  await app.open("/new")
  await screen.getByLabel("Organization name").fill(orgName)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  // The owner: the plan is sample data, prices stay placeholders, and the provider controls are off.
  await app.open(`/${slug}/settings/billing`)
  await expect(screen.getByText("Billing isn't connected yet.")).toBeVisible()
  await expect(screen.getByText("Payments are handled by Stripe.", { exact: false })).toBeVisible()
  await expect(screen.getByText("[SAMPLE DATA]").first()).toBeVisible()
  await expect(screen.getByText("[PRICE] per seat / month", { exact: false })).toBeVisible()
  await expect(screen.getByRole("button", "Manage subscription")).toBeDisabled()
  await expect(screen.getByRole("button", "Change seats")).toBeDisabled()
  await expect(screen.getByRole("button", "Cancel plan")).toBeDisabled()
  await expect(screen.getByRole("button", "Upgrade")).toBeDisabled()
  await expect(screen.getByRole("button", "Edit")).toBeDisabled()
  await expect(screen.getByRole("columnheader", "Amount")).toBeVisible()

  // A viewer invited by the owner: no billing page, only the notice naming an owner or admin.
  const link = await inviteAs(ctx, { slug, email: viewerEmail, role: "viewer" })
  await signOutUi(ctx)
  await acceptInvitationAs(ctx, {
    link,
    name: "Vic Chen",
    email: viewerEmail,
    organizationName: orgName,
  })
  await app.open(`/${slug}/settings/billing`)
  await expect(
    screen.getByText("Billing isn't available for your role. Ask an owner or admin."),
  ).toBeVisible()
  await expect(screen.getByRole("button", "Manage subscription")).toBeHidden()
})
