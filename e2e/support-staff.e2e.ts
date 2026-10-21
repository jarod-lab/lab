import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import {
  actAs,
  agentTicket,
  backToQueue,
  customerThread,
  details,
  dkimSigned,
  message,
  openFromQueue,
  openTicketApi,
  openWidget,
  overflowsSideways,
  queue,
  queueRow,
  rawMessage,
  relayInbound,
  sendFromQueue,
  signInAdmin,
  signUpPerson,
  tabTo,
  thread,
  threadMail,
} from "./support/support"
import { SUPPORT_REPLY_DOMAIN } from "./support/support-stack"
import { uniqueId } from "./support/unique"

// The support queue (/admin/support, docs/support.md) as staff work it, with what reaches the
// customer: in the app, by mail (the dev mail sink) and back by mail (support's inbound endpoint,
// through the raw relay the e2e stack configures). Staff are the `admin` credential, owner of the
// operator organization the stack seeds. Customers' tickets are opened over support's API; the
// queue's search keeps each journey to its own tickets while others run beside it.

test("an agent's reply reaches the customer in the app and by mail, and their emailed answer threads back", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const subject = `Sync fails ${unique}`
  const customer = await signUpPerson(app, "Grace Mailer")
  const ticket = await openTicketApi(app, customer, subject, { body: "Sync fails at 80%." })

  // Deep link: /admin/support/<id> opens the ticket in the queue. J2: the agent replies.
  const staff = await signInAdmin(ctx)
  await app.open(`/admin/support/${ticket.id}`)
  await expect(thread(screen, subject)).toBeVisible()
  await sendFromQueue(screen, subject, "Reply", `Fixed on our side, ${unique}.`)

  // The mail goes before the customer looks (a reply they've seen is not mailed): the subject, the
  // ticket's page as its link, and Reply-To support+<token>@ the reply domain.
  await expect
    .poll(() => threadMail(app, customer.email, ticket.number), { timeout: 20_000 })
    .not.toBeNull()
  const mail = await threadMail(app, customer.email, ticket.number)
  expect(mail?.subject).toBe(`[#${ticket.number}] ${subject}`)
  expect(mail?.text).toContain(`Fixed on our side, ${unique}.`)
  expect(mail?.links.some((link) => link.endsWith(`/account/support/${ticket.id}`))).toBe(true)
  const replyTo = mail?.replyTo ?? ""
  expect(replyTo).toMatch(
    new RegExp(`^support\\+[^@]+@${SUPPORT_REPLY_DOMAIN.replace(".", "\\.")}$`),
  )

  // In the app: the customer's widget has the reply.
  await actAs(browser, app, customer.cookies)
  await app.open(`/${customer.slug}`)
  const panel = await openWidget(screen)
  await panel.getByRole("button", new RegExp(subject)).tap()
  await expect(panel.getByText(`Fixed on our side, ${unique}.`)).toBeVisible()
  await browser.keyboard.press("Escape")

  // J5: they answer the mail. Unsigned, it can't prove it is theirs, so it isn't added; signed by
  // their domain (DKIM), it threads onto the ticket by the Reply-To token.
  const answer = (text: string) =>
    rawMessage({ from: customer.email, to: replyTo, subject: `Re: ${mail?.subject}`, text })
  expect(await relayInbound(app, answer(`Unsigned ${unique}`))).toBe(202)
  const signed = await dkimSigned(answer(`Works now, thanks ${unique}`), customer.email)
  expect(await relayInbound(app, signed)).toBe(202)

  await app.open(`/account/support/${ticket.id}`)
  const inline = screen.getByRole("region", "Support")
  await expect(inline.getByText(`Works now, thanks ${unique}`)).toBeVisible()
  const bodies = (await customerThread(app, customer, ticket.id)).messages.map((m) => m.body)
  expect(bodies.some((body) => body.includes(`Unsigned ${unique}`))).toBe(false)

  // Staff see the emailed answer in the thread too, and the ticket is open again.
  await actAs(browser, app, staff)
  await app.open(`/admin/support/${ticket.id}`)
  await expect(message(screen, subject, `Works now, thanks ${unique}`)).toBeVisible()
  expect((await agentTicket(app, staff, ticket.id)).status).toBe("open")
})

test("staff filter the queue: open, unassigned, mine and a tag", async (ctx) => {
  const { app, screen } = ctx
  const unique = uniqueId()
  const customer = await signUpPerson(app, "Filter Customer", { verified: false })
  const mine = `Filter mine ${unique}`
  const other = `Filter other ${unique}`
  await openTicketApi(app, customer, mine)
  await openTicketApi(app, customer, other)
  const tag = `vip${unique}`

  await signInAdmin(ctx)
  await app.open("/admin/support")
  // Assign one to me and tag it; solve the other.
  await openFromQueue(screen, mine)
  let panel = await details(screen)
  await panel.getByLabel("Assignee").selectOption("E2E Admin")
  await panel.getByLabel("Tag").fill(tag)
  await panel.getByRole("button", "Add tag").tap()
  await expect(panel.getByRole("button", `Remove tag ${tag}`)).toBeVisible()
  await backToQueue(screen, mine)
  await openFromQueue(screen, other)
  panel = await details(screen)
  await panel.getByLabel("Status").selectOption("Solved")
  await expect(thread(screen, other).getByText(/changed from Open to Solved/)).toBeVisible()
  await backToQueue(screen, other)

  // J6: the queue's search names both; each filter keeps only its own.
  const list = queue(screen)
  await list.getByRole("searchbox").fill(unique)
  await expect(queueRow(screen, mine)).toBeVisible()
  await expect(queueRow(screen, other)).toBeVisible()

  await list.getByLabel("Filter by status").selectOption("Open")
  await expect(queueRow(screen, mine)).toBeVisible()
  await expect(queueRow(screen, other)).toBeHidden()
  await list.getByLabel("Filter by status").selectOption("All statuses")

  await list.getByLabel("Filter by assignee").selectOption("Unassigned")
  await expect(queueRow(screen, other)).toBeVisible()
  await expect(queueRow(screen, mine)).toBeHidden()
  await list.getByLabel("Filter by assignee").selectOption("Assigned to me")
  await expect(queueRow(screen, mine)).toBeVisible()
  await expect(queueRow(screen, other)).toBeHidden()
  await list.getByLabel("Filter by assignee").selectOption("Everyone")

  await list.getByLabel("Filter by tag").selectOption(tag)
  await expect(queueRow(screen, mine)).toBeVisible()
  await expect(queueRow(screen, other)).toBeHidden()
  await list.getByLabel("Filter by tag").selectOption("All tags")

  // The count chips filter too: mine.
  const chip = list.getByRole("button", /^\d+ mine$/)
  await chip.tap()
  await expect(chip).toHaveAttribute("aria-pressed", "true")
  await expect(queueRow(screen, mine)).toBeVisible()
  await expect(queueRow(screen, other)).toBeHidden()
})

test("an internal note stays with staff; a reply reaches the customer", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const subject = `Refund request ${unique}`
  const customer = await signUpPerson(app, "Nora Notes", { verified: false })
  const ticket = await openTicketApi(app, customer, subject)

  await signInAdmin(ctx)
  await app.open(`/admin/support/${ticket.id}`)
  // J7: a note, then a reply. The note is marked as such in the thread.
  await sendFromQueue(screen, subject, "Internal note", `Note: on the legacy plan ${unique}`)
  await sendFromQueue(screen, subject, "Reply", `Refund issued ${unique}`)
  const open = thread(screen, subject)
  await expect(
    open.getByRole("article").filter({ hasText: `legacy plan ${unique}` }),
  ).toContainText("Note")

  // The customer sees the reply, never the note: on their page and in support's answer.
  await actAs(browser, app, customer.cookies)
  await app.open(`/account/support/${ticket.id}`)
  const inline = screen.getByRole("region", "Support")
  await expect(inline.getByText(`Refund issued ${unique}`)).toBeVisible()
  await expect(inline.getByText(`legacy plan ${unique}`)).toBeHidden()
  const bodies = (await customerThread(app, customer, ticket.id)).messages.map((m) => m.body)
  expect(bodies.some((body) => body.includes(`legacy plan ${unique}`))).toBe(false)
})

test("staff set status, priority, assignee and tags, and bulk-update tickets", async (ctx) => {
  const { app, screen } = ctx
  const unique = uniqueId()
  const customer = await signUpPerson(app, "Bulk Customer", { verified: false })
  const one = await openTicketApi(app, customer, `Bulk one ${unique}`)
  const two = await openTicketApi(app, customer, `Bulk two ${unique}`)
  const three = await openTicketApi(app, customer, `Bulk three ${unique}`)
  const tag = `billing${unique}`

  const staff = await signInAdmin(ctx)
  await app.open("/admin/support")
  // J8, one ticket: each change shows in the thread's timeline.
  await openFromQueue(screen, one.subject)
  const panel = await details(screen)
  const open = thread(screen, one.subject)
  await panel.getByLabel("Status").selectOption("Pending")
  await expect(
    open.getByText("Status changed from Open to Pending", { exact: false }),
  ).toBeVisible()
  await panel.getByLabel("Priority").selectOption("High")
  await expect(open.getByText("Priority set to High", { exact: false })).toBeVisible()
  await panel.getByLabel("Assignee").selectOption("E2E Admin")
  await expect(open.getByText("Assigned to E2E Admin", { exact: false })).toBeVisible()
  await panel.getByLabel("Tag").fill(tag)
  await panel.getByRole("button", "Add tag").tap()
  await expect(panel.getByRole("button", `Remove tag ${tag}`)).toBeVisible()
  await expect
    .poll(() => agentTicket(app, staff, one.id))
    .toMatchObject({ status: "pending", priority: "high", tags: [tag] })
  expect((await agentTicket(app, staff, one.id)).assigneeId).not.toBeNull()

  // Bulk: select two from the queue, set their status and priority at once.
  await backToQueue(screen, one.subject)
  const list = queue(screen)
  await list.getByRole("searchbox").fill(unique)
  await list.getByRole("checkbox", `Select ticket #${two.number}`).check()
  await list.getByRole("checkbox", `Select ticket #${three.number}`).check()
  await expect(list.getByText("2 selected")).toBeVisible()
  await list.getByLabel("Set status…").selectOption("Solved")
  await expect.poll(async () => (await agentTicket(app, staff, two.id)).status).toBe("solved")
  await list.getByLabel("Set priority…").selectOption("Urgent")
  await expect.poll(async () => (await agentTicket(app, staff, three.id)).priority).toBe("urgent")
  for (const ticket of [two, three]) {
    expect(await agentTicket(app, staff, ticket.id)).toMatchObject({
      status: "solved",
      priority: "urgent",
    })
  }
  // The one left out keeps what it had.
  expect((await agentTicket(app, staff, one.id)).status).toBe("pending")
})

test("keyboard only at 360 px: staff reach a ticket and send an internal note", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const subject = `Keyboard staff ${unique}`
  const customer = await signUpPerson(app, "Kai Keys", { verified: false })
  await openTicketApi(app, customer, subject)

  await browser.setViewport({ width: 360, height: 740 })
  await signInAdmin(ctx)
  await app.open("/admin/support")
  await expect(queue(screen)).toBeVisible()
  expect(await overflowsSideways(browser)).toBe(false)

  // Search, then the ticket's row, then Enter: the thread replaces the queue at this width.
  await tabTo(browser, (el) => el.label === "Search by number or subject")
  await browser.keyboard.type(subject)
  await expect(queueRow(screen, subject)).toBeVisible()
  await tabTo(browser, (el) => el.tag === "BUTTON" && el.text.includes(subject))
  await browser.keyboard.press("Enter")
  const open = thread(screen, subject)
  await expect(open).toBeVisible()
  expect(await overflowsSideways(browser)).toBe(false)

  // The message type is a radio group: Tab reaches the checked one, an arrow key moves to the note.
  await tabTo(browser, (el) => el.tag === "INPUT" && el.label === "Reply")
  await browser.keyboard.press("ArrowRight")
  await expect(open.getByRole("radio", "Internal note")).toBeChecked()
  await tabTo(browser, (el) => el.label === "Write a message")
  await browser.keyboard.type(`Keyboard note ${unique}`)
  await tabTo(browser, (el) => el.tag === "BUTTON" && el.text === "Send")
  await browser.keyboard.press("Enter")
  await expect(message(screen, subject, `Keyboard note ${unique}`)).toBeVisible()
  expect(await overflowsSideways(browser)).toBe(false)
})
