import { test } from "@e2e-dev/web"
import { credentials, expect } from "e2e"

import { PASSWORD, signUpUi } from "./support/invitations"

// The platform admin page (/admin, not on the boards): who may open it, and the admin's actions on a user.
// Promotion to admin is a database change the suite can't make, so the admin journey needs an account
// that already has the role: E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see e2e/README.md). Without them that
// journey is skipped with that message; the access checks below always run.

const ADMIN_READY = Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)
const NEEDS_ADMIN =
  "needs an admin account: set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD (see e2e/README.md, 'Admin account')"

test("signed out, /admin asks for sign-in and comes back to /admin", async ({
  app,
  browser,
  screen,
}) => {
  await app.open("/admin")
  await expect(browser).toHaveURL(/\/sign-in\?next=%2Fadmin/)
  await expect(screen.getByRole("heading", "Sign in")).toBeVisible()
})

test("a person who is not an admin sees Not available, not the users", async (ctx) => {
  const { app, screen } = ctx
  const email = `nora.${Date.now().toString(36)}@example.com`
  await signUpUi(ctx, "Nora Member", email)

  await app.open("/admin")
  await expect(screen.getByRole("heading", "Not available")).toBeVisible()
})

test("an admin finds a user, bans and unbans them, and impersonates them", async (ctx) => {
  test.skip(!ADMIN_READY, NEEDS_ADMIN)
  const { app, screen, browser } = ctx
  const admin = credentials.user("admin")
  const unique = Date.now().toString(36)
  const email = `target.${unique}@example.com`
  const name = `Target ${unique}`

  // The person to act on: made through the API, the way another browser would.
  if (!app.baseUrl) throw new Error("the app has no base URL")
  const created = await fetch(new URL("/api/auth/sign-up/email", app.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin: app.baseUrl },
    body: JSON.stringify({ name, email, password: PASSWORD }),
  })
  expect(created.status).toBe(200)

  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(admin.username)
  await screen.getByLabel("Password").fill(admin.password)
  await screen.getByRole("button", "Sign in with email").tap()
  await expect(browser).not.toHaveURL(/\/two-factor|\/sign-in/)

  await app.open("/admin")
  await screen.getByLabel("Search by email").fill(email)
  await expect(screen.getByRole("row", name, { exact: false })).toBeVisible()

  // Ban: the consequence is named, the reason and duration go with it.
  await screen.getByRole("button", `Actions for ${name}`).tap()
  await screen.getByRole("menuitem", "Ban").tap()
  const ban = screen.getByRole("dialog")
  await expect(
    ban.getByText("Signs them out everywhere and blocks sign-in until the ban ends."),
  ).toBeVisible()
  await ban.getByLabel("Reason (optional)").fill("e2e check")
  await ban.getByRole("button", "Ban user").tap()
  await expect(screen.getByRole("row", name, { exact: false })).toContainText("Banned")

  // Unban puts them back.
  await screen.getByRole("button", `Actions for ${name}`).tap()
  await screen.getByRole("menuitem", "Unban").tap()
  await screen.getByRole("dialog").getByRole("button", "Unban").tap()
  await expect(screen.getByRole("row", name, { exact: false })).toContainText("Active")

  // Impersonate: the banner names them, Stop returns to /admin.
  await screen.getByRole("button", `Actions for ${name}`).tap()
  await screen.getByRole("menuitem", "Impersonate").tap()
  await screen.getByRole("dialog").getByRole("button", "Impersonate").tap()
  await expect(screen.getByText(new RegExp(`You are impersonating ${name}`))).toBeVisible()
  await screen.getByRole("button", "Stop").tap()
  await expect(browser).toHaveURL(/\/admin$/)
  await expect(screen.getByRole("heading", "Admin")).toBeVisible()
})
