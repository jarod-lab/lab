import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { inviteAs, signUpUi } from "./support/invitations"
import { uniqueId } from "./support/unique"

// Plan entitlements (@byo-oss/entitlements, docs/database.md 0015): without Stripe every
// organization is on Free (3 seats with viewers free, 2 agents). J1: the Billing page shows the plan
// the API enforces and today's usage, real figures beside the sample billing data. J2: a refusal
// names the upgrade instead of failing: the third agent, and a fourth paid seat. Locators only;
// desktop and phone run the same journeys.

async function newOrganization(ctx: Parameters<typeof signUpUi>[0], label: string) {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const slug = `${label}-${unique}`
  await signUpUi(ctx, "Ada Lovelace", `ada.${unique}@example.com`)
  await app.open("/new")
  await screen.getByLabel("Organization name").fill(`${label} Ltd ${unique}`)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))
  return { slug, unique }
}

test("the billing page shows the Free plan and its usage; a third agent asks for an upgrade", async (ctx) => {
  const { app, screen } = ctx
  const { slug } = await newOrganization(ctx, "plan")

  // J1: the plan as the API enforces it, and today's requests.
  await app.open(`/${slug}/settings/billing`)
  const usage = screen.getByRole("region", "Plan usage")
  await expect(usage.getByText("Your plan")).toBeVisible()
  await expect(usage.getByText("Free", { exact: true })).toBeVisible()
  await expect(
    usage.getByText("1 of 3 seats used · viewers are free · up to 2 agents"),
  ).toBeVisible()
  await expect(usage.getByText("Requests today:", { exact: false })).toBeVisible()

  // J2: two agents fit the plan; the third is refused with the plan that allows more.
  await app.open(`/${slug}/settings/agents`)
  for (const name of ["First agent", "Second agent", "Third agent"]) {
    await screen.getByRole("button", "Create agent").first().tap()
    const dialog = screen.getByRole("dialog")
    await dialog.getByLabel("Name").fill(name)
    await dialog.getByRole("button", "Create agent").tap()
    if (name !== "Third agent") {
      await expect(screen.getByRole("button", name, { exact: false })).toBeVisible()
    }
  }
  // The dialog's alert: the message, then the hint naming the plan (the alert and its text match).
  await expect(
    screen.getByText("Upgrade to Pro or Team for more agents", { exact: false }).first(),
  ).toBeVisible()
})

test("a fourth paid seat on Free is refused with the upgrade; a viewer still joins free", async (ctx) => {
  const { app, screen } = ctx
  const { slug, unique } = await newOrganization(ctx, "seats")

  await inviteAs(ctx, { slug, email: `m1.${unique}@example.com`, role: "member" })
  await inviteAs(ctx, { slug, email: `m2.${unique}@example.com`, role: "admin" })

  // Owner + two pending invitations: 3 of Free's 3 seats.
  await app.open(`/${slug}/settings/members`)
  await screen.getByLabel("Invite by email").fill(`m3.${unique}@example.com`)
  await screen.getByLabel("Role").selectOption("Member")
  await screen.getByRole("button", "Send invites").tap()
  await expect(screen.getByText("Upgrade to Pro or Team", { exact: false })).toBeVisible()

  // Viewers are free on every plan.
  await inviteAs(ctx, { slug, email: `v.${unique}@example.com`, role: "viewer" })
})
