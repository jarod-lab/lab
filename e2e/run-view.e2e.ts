import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { signUpUi } from "./support/invitations"
import { seedNeedsYouRun } from "./support/runs"

// The run view (docs/build-app/boards/project/DirLift): an owner's agent asks to post a summary. The run
// shows up under Needs you on the org's home; the owner approves, sees the 30-second undo, undoes, approves
// again and lets it pass; then steers the run and defers it. G then H goes home. Locators only, desktop
// and phone. The run is seeded through the API with an agent key (support/runs.ts).

const PASSWORD = "correct horse battery staple 42"
const TITLE = "v2.8 triage"
const ACTION = "Post summary to #releases"

test("owner approves with undo, steers and defers a run that needs them", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = Date.now().toString(36)
  const email = `ada.${unique}@example.com`
  const slug = `runs-${unique}`

  await signUpUi(ctx, "Ada Lovelace", email)
  await app.open("/new")
  await screen.getByLabel("Organization name").fill(`Runs Ltd ${unique}`)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  // The agent asks for a decision; the home lists the run under Needs you.
  await seedNeedsYouRun(app, { email, password: PASSWORD, slug, title: TITLE, action: ACTION })
  await app.open(`/${slug}`)
  await expect(screen.getByRole("region", "Needs you")).toBeVisible()
  await screen.getByRole("link", TITLE, { exact: false }).tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}/runs/[^/]+$`))
  await expect(screen.getByRole("heading", TITLE)).toBeVisible()
  await expect(screen.getByRole("heading", ACTION)).toBeVisible()

  // Approve: the decision is shown with an undo countdown from the server's end time.
  await screen.getByRole("button", "Approve").tap()
  await expect(screen.getByText(/Undo available for \d+ seconds?\./)).toBeVisible()

  // Undo within the window: the approval is pending again, and both decisions are offered.
  await screen.getByRole("button", "Undo").tap()
  await expect(screen.getByRole("button", "Approve")).toBeVisible()
  await expect(screen.getByRole("button", "Deny")).toBeVisible()

  // Approve again and let the window pass: the decision is final and the undo goes.
  await screen.getByRole("button", "Approve").tap()
  await expect(screen.getByText(/Undo available for \d+ seconds?\./)).toBeVisible()
  await expect(screen.getByText("The decision is now final.")).toBeVisible({ timeout: 35_000 })
  await expect(screen.getByRole("button", "Undo")).toBeHidden()

  // Steer: the message is sent and listed with the run's messages.
  await screen.getByRole("textbox", "Steer this run").fill("Skip the billing item")
  await screen.getByRole("button", "Send").tap()
  await expect(screen.getByText("Skip the billing item")).toBeVisible()

  // Defer: a time in the future queues the run until then.
  await screen.getByRole("button", "Defer").tap()
  const defer = screen.getByRole("dialog")
  await defer.getByLabel("Start again at").fill(futureLocal())
  await defer.getByRole("button", "Defer run").tap()
  await expect(screen.getByText(/Queued until/)).toBeVisible()

  // G then H goes home, from anywhere in the shell.
  await browser.keyboard.press("g")
  await browser.keyboard.press("h")
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))
})

/** Two days from now, in the datetime-local format the picker takes. */
function futureLocal(): string {
  const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
