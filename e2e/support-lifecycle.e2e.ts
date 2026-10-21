import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { pathAndQuery, mailLinkTo } from "./support/mail"
import {
  actAs,
  addMember,
  agentTicket,
  api,
  apiStatus,
  createOrganization,
  details,
  openFromQueue,
  openTicketApi,
  signInAdmin,
  signUpPerson,
} from "./support/support"
import { OPERATOR_ORGANIZATION_ID, OPERATOR_SLUG } from "./support/support-stack"
import { uniqueId } from "./support/unique"

// What happens to support tickets when the people and organizations around them go
// (docs/support.md, Cleanup), each through the starter's own page for it: deleting an account,
// deleting an organization, removing a member of the staff organization. Staff check the outcome
// through support's own API.

test("a deleted account's tickets in a team organization stay, without the person", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const slug = `keeps-${unique}`
  const owner = await signUpPerson(app, "Olga Owner", { verified: false })
  const customer = await signUpPerson(app, "Dana Departing")
  const organizationId = await createOrganization(app, owner, "Keeps Ltd", slug)
  await addMember(app, owner.cookies, customer, organizationId)
  const kept = await openTicketApi(app, customer, `Team ticket ${unique}`, { organizationId })
  // A ticket from their personal workspace (the widget's organization on their own pages).
  const personal = await openTicketApi(app, customer, `Personal ticket ${unique}`, {
    organizationId: (
      await api<{ id: string; slug: string }[]>(
        app,
        customer.cookies,
        "/api/auth/organization/list",
      )
    ).find((org) => org.slug === customer.slug)?.id,
  })

  // They delete their account from the profile page and confirm from the email.
  await actAs(browser, app, customer.cookies)
  await app.open("/account/profile")
  await screen.getByRole("button", "Delete my account").tap()
  await screen.getByRole("alertdialog").getByRole("button", "Email me the link").tap()
  await expect.poll(() => mailLinkTo(app, customer.email, /delete-user/)).not.toBeNull()
  const link = await mailLinkTo(app, customer.email, /delete-user/)
  await app.open(pathAndQuery(link ?? ""))

  // The team's ticket stays, with no person and no copy of their address; the personal
  // workspace's goes with the workspace (its organization cascades).
  const staff = await signInAdmin(ctx)
  await expect.poll(async () => (await agentTicket(app, staff, kept.id)).userId).toBeNull()
  // Nowhere in what staff see: not as the requester, not as an account-less sender's address.
  expect(JSON.stringify(await agentTicket(app, staff, kept.id))).not.toContain(customer.email)
  expect(await apiStatus(app, staff, `/api/auth/support/agent/ticket?id=${personal.id}`)).toBe(404)
})

test("deleting an organization deletes its tickets", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const slug = `gone-${unique}`
  const owner = await signUpPerson(app, "Gil Gone", { verified: false })
  const organizationId = await createOrganization(app, owner, "Gone Company", slug)
  const ticket = await openTicketApi(app, owner, `Org ticket ${unique}`, { organizationId })

  await actAs(browser, app, owner.cookies)
  await app.open(`/${slug}/settings/general`)
  await screen.getByRole("button", "Delete organization").tap()
  const dialog = screen.getByRole("alertdialog")
  await dialog.getByLabel(/to confirm/).fill("Gone Company")
  await dialog.getByRole("button", "Delete organization").tap()
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+$/)

  const staff = await signInAdmin(ctx)
  expect(await apiStatus(app, staff, `/api/auth/support/agent/ticket?id=${ticket.id}`)).toBe(404)
  const { tickets } = await api<{ tickets: { id: string }[] }>(
    app,
    owner.cookies,
    "/api/auth/support/my-tickets",
  )
  expect(tickets.map((row) => row.id)).not.toContain(ticket.id)
})

test("removing a staff member unassigns their tickets", async (ctx) => {
  const { app, screen } = ctx
  const unique = uniqueId()
  const name = `Sam Staff ${unique}`
  const customer = await signUpPerson(app, "Cora Customer", { verified: false })
  const ticket = await openTicketApi(app, customer, `Assigned away ${unique}`)

  // A new member of the staff organization, invited by the admin (its owner).
  const staff = await signInAdmin(ctx)
  const staffer = await signUpPerson(app, name, { verified: false })
  await addMember(app, staff, staffer, OPERATOR_ORGANIZATION_ID)

  // The admin assigns the ticket to them from the queue.
  await app.open("/admin/support")
  await openFromQueue(screen, ticket.subject)
  const panel = await details(screen)
  await panel.getByLabel("Assignee").selectOption(name)
  await expect
    .poll(async () => (await agentTicket(app, staff, ticket.id)).assigneeId)
    .toBe(staffer.userId)

  // Then removes them on the staff organization's Members page.
  await app.open(`/${OPERATOR_SLUG}/settings/members`)
  await screen.getByRole("button", `More actions for ${name}`).tap()
  await screen.getByRole("menuitem", "Remove from organization").tap()
  await screen.getByRole("alertdialog").getByRole("button", "Remove member").tap()
  await expect(screen.getByText(staffer.email)).toBeHidden()

  await expect.poll(async () => (await agentTicket(app, staff, ticket.id)).assigneeId).toBeNull()
})
