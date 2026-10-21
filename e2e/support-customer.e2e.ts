import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import {
  type CustomerTicket,
  actAs,
  addMember,
  api,
  createOrganization,
  customerThread,
  launcher,
  newTicketInWidget,
  openWidget,
  overflowsSideways,
  signUpPerson,
  supportPanel,
  tabTo,
} from "./support/support"
import { uniqueId } from "./support/unique"

// Support as a customer finds it (docs/support.md): the widget at the end of the top bar, the
// requester's page a thread mail links to, and a ticket shared with their organization. People are
// made over the API and their sessions set on the browser; everything they do is on screen.
// Locators only; desktop and phone run the same journeys.

test("a customer opens a ticket from the top bar, finds it in their list and on its page, solves and rates it", async ({
  app,
  screen,
  browser,
}) => {
  const unique = uniqueId()
  const subject = `Export stuck ${unique}`
  const customer = await signUpPerson(app, "Grace Hopper")
  await actAs(browser, app, customer.cookies)
  await app.open(`/${customer.slug}`)

  // J1: from the top bar, a new ticket opens its thread; Back lists it.
  const panel = await openWidget(screen)
  await newTicketInWidget(panel, subject, "The CSV export spins forever.")
  await expect(panel.getByText("The CSV export spins forever.")).toBeVisible()
  await panel.getByRole("button", "Back").tap()
  await expect(panel.getByRole("heading", "My tickets")).toBeVisible()
  await expect(panel.getByRole("button", new RegExp(subject))).toBeVisible()
  await browser.keyboard.press("Escape")
  await expect(supportPanel(screen)).toBeHidden()

  // The requester's page (the thread mail's link) shows the thread in the page, the popover closed.
  const { tickets } = await api<{ tickets: CustomerTicket[] }>(
    app,
    customer.cookies,
    "/api/auth/support/my-tickets",
  )
  const ticket = tickets.find((row) => row.subject === subject)
  if (!ticket) throw new Error("the new ticket is not in the customer's list")
  await app.open(`/account/support/${ticket.id}`)
  const inline = screen.getByRole("region", "Support")
  await expect(inline.getByRole("heading", new RegExp(subject))).toBeVisible()
  await expect(supportPanel(screen)).toBeHidden()

  // The address follows the page: Back lists their tickets at /account/support, the row reopens it.
  await inline.getByRole("button", "Back").tap()
  await expect(browser).toHaveURL(/\/account\/support$/)
  await inline.getByRole("button", new RegExp(subject)).tap()
  await expect(browser).toHaveURL(new RegExp(`/account/support/${ticket.id}$`))

  // J3: rating is offered once it is solved; mark solved, then rate. Support records both.
  await expect(inline.getByRole("button", "Good")).toBeHidden()
  await inline.getByRole("button", "Mark solved").tap()
  await expect(inline.getByRole("button", "Reopen")).toBeVisible()
  await inline.getByRole("button", "Good").tap()
  await expect(inline.getByRole("button", "Good")).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(async () => (await customerThread(app, customer, ticket.id)).ticket)
    .toMatchObject({ status: "solved", rating: "good" })
})

test("a customer shares a ticket with their organization; a teammate there sees it and replies", async ({
  app,
  screen,
  browser,
}) => {
  const unique = uniqueId()
  const subject = `Shared invoice question ${unique}`
  const slug = `shared-${unique}`
  const owner = await signUpPerson(app, "Ada Owner")
  const teammate = await signUpPerson(app, "Lin Teammate")
  const organizationId = await createOrganization(app, owner, "Shared Ltd", slug)
  await addMember(app, owner.cookies, teammate, organizationId)

  // J4: the owner opens a private ticket in the organization's pages, then shares it from the thread.
  await actAs(browser, app, owner.cookies)
  await app.open(`/${slug}`)
  const panel = await openWidget(screen)
  await newTicketInWidget(panel, subject, "Which address goes on the invoice?")
  await panel.getByRole("checkbox", "Share with my organization").check()
  await expect(panel.getByRole("checkbox", "Share with my organization")).toBeChecked()
  await browser.keyboard.press("Escape")

  // The teammate finds it in their own widget, reads it and replies. Only the requester solves.
  await actAs(browser, app, teammate.cookies)
  await app.open(`/${slug}`)
  const theirs = await openWidget(screen)
  await theirs.getByRole("button", new RegExp(subject)).tap()
  await expect(theirs.getByText("Which address goes on the invoice?")).toBeVisible()
  await expect(theirs.getByRole("button", "Mark solved")).toBeHidden()
  await theirs.getByLabel("Reply").fill(`The Berlin office, ${unique}.`)
  await theirs.getByRole("button", "Send").tap()
  await expect(theirs.getByText(`The Berlin office, ${unique}.`)).toBeVisible()
})

test("keyboard only at 360 px: open the widget, create a ticket, open its thread, Escape back to the launcher", async ({
  app,
  screen,
  browser,
}) => {
  const unique = uniqueId()
  const subject = `Keyboard ticket ${unique}`
  const customer = await signUpPerson(app, "Kim Keys", { verified: false })
  await browser.setViewport({ width: 360, height: 740 })
  await actAs(browser, app, customer.cookies)
  await app.open("/account/profile")
  await expect(launcher(screen)).toBeVisible()
  expect(await overflowsSideways(browser)).toBe(false)

  // Tab from the top of the page to the launcher, open it with Enter.
  await tabTo(browser, (el) => el.tag === "BUTTON" && el.text === "Support")
  await browser.keyboard.press("Enter")
  const panel = supportPanel(screen)
  await expect(panel).toBeVisible()
  expect(await overflowsSideways(browser)).toBe(false)

  // New ticket: Tab to it, Enter, then fill the form with typing and submit with Enter.
  await tabTo(browser, (el) => el.text === "New ticket")
  await browser.keyboard.press("Enter")
  await tabTo(browser, (el) => el.label === "Subject")
  await browser.keyboard.type(subject)
  await tabTo(browser, (el) => el.label === "Message")
  await browser.keyboard.type("Typed without a mouse.")
  await tabTo(browser, (el) => el.text === "Submit ticket")
  await browser.keyboard.press("Enter")
  await expect(panel.getByRole("heading", new RegExp(subject))).toBeVisible()
  expect(await overflowsSideways(browser)).toBe(false)

  // Escape closes the panel and puts focus back on the launcher.
  await browser.keyboard.press("Escape")
  await expect(panel).toBeHidden()
  await expect(launcher(screen)).toBeFocused()

  // Enter reopens it where it was; Back (Shift+Tab, Space) lists the ticket; Enter opens its thread.
  await browser.keyboard.press("Enter")
  await expect(panel.getByRole("heading", new RegExp(subject))).toBeVisible()
  await tabTo(browser, (el) => el.text === "Back", "Shift+Tab")
  await browser.keyboard.press("Space")
  await expect(panel.getByRole("heading", "My tickets")).toBeVisible()
  await tabTo(browser, (el) => el.tag === "BUTTON" && el.text.includes(subject))
  await browser.keyboard.press("Enter")
  await expect(panel.getByRole("heading", new RegExp(subject))).toBeVisible()
  await expect(panel.getByText("Typed without a mouse.")).toBeVisible()
  expect(await overflowsSideways(browser)).toBe(false)

  await browser.keyboard.press("Escape")
  await expect(panel).toBeHidden()
  await expect(launcher(screen)).toBeFocused()
})
