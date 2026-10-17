import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { acceptInvitationAs, inviteAs, signInUi, signOutUi, signUpUi } from "./support/invitations"

// The Members page (docs/build-app/boards/project/OrgMembers): the owner invites a second person by email,
// the invitee accepts the link from the mail sink in their own session and sees the page read-only, then
// the owner changes their role and removes them. Locators only; desktop and phone run the same journey.
// Needs the stack (see e2e.config.ts): DEV_MAIL_SINK is on there, so the invitation email is readable.

test("owner invites a member, the member accepts and sees a read-only page, the owner changes and removes them", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = Date.now().toString(36)
  const ownerEmail = `ada.${unique}@example.com`
  const inviteeEmail = `lin.${unique}@example.com`
  const slug = `members-${unique}`
  const orgName = "Members Ltd"

  await signUpUi(ctx, "Ada Lovelace", ownerEmail)

  // An organization of our own, so the page's address is known and reruns don't clash.
  await app.open("/new")
  await screen.getByLabel("Organization name").fill(orgName)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  // Invite: the role defaults to the organization's invite default (Member for a new organization).
  const link = await inviteAs(ctx, { slug, email: inviteeEmail })

  // The invitee accepts in their own session.
  await signOutUi(ctx)
  await acceptInvitationAs(ctx, {
    link,
    name: "Lin Park",
    email: inviteeEmail,
    organizationName: orgName,
  })

  // As a member: the list is there, but nothing to invite or change, and no security columns.
  await app.open(`/${slug}/settings/members`)
  await expect(
    screen.getByText("Only owners and admins can invite and manage members."),
  ).toBeVisible()
  await expect(screen.getByLabel("Invite by email")).toBeHidden()
  await expect(screen.getByRole("button", /^Role for /)).toBeHidden()
  await expect(screen.getByRole("columnheader", "Two-factor")).toBeHidden()
  await expect(screen.getByText("Lin Park (you)")).toBeVisible()

  // Back to the owner: change the invitee's role, then remove them with the consequence named.
  await signOutUi(ctx)
  await signInUi(ctx, ownerEmail)
  await app.open(`/${slug}/settings/members`)
  await screen.getByRole("button", "Role for Lin Park: Member").tap()
  await screen.getByRole("menuitemradio", "Admin").tap()
  await expect(screen.getByRole("button", "Role for Lin Park: Admin")).toBeVisible()

  await screen.getByRole("button", "More actions for Lin Park").tap()
  await screen.getByRole("menuitem", "Remove from organization").tap()
  const dialog = screen.getByRole("alertdialog")
  await expect(
    dialog.getByText("Lin Park loses access now; their agent grants in this org end.", {
      exact: false,
    }),
  ).toBeVisible()
  await dialog.getByRole("button", "Remove member").tap()
  await expect(screen.getByText(inviteeEmail)).toBeHidden()
})
