import { test } from "@e2e-dev/web"
import { type Locator, type Screen, expect } from "e2e"

// The app shell's journey (docs/build-app/boards/project/OrgSwitcher and Sidebar): a new account lands
// in its personal organization, creates and switches organizations, sets the theme and uses the keys.
// Locators only, no model. Needs the stack (see e2e.config.ts). Runs on desktop and phone: at phone
// width the sidebar is a drawer, opened from the top bar.

const PASSWORD = "correct horse battery staple 42"

test("sign up, create and switch organizations, theme, shortcuts", async ({
  app,
  screen,
  browser,
}) => {
  const unique = Date.now().toString(36)
  const email = `ada.${unique}@example.com`
  const slug = `acme-${unique}`

  await app.open("/sign-up")
  await screen.getByLabel("Name").fill("Ada Lovelace")
  await screen.getByLabel("Work email").fill(email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Create account").tap()

  // Sign-up lands on the agents page of the personal organization (it is the active one).
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+\/settings\/agents$/)
  await openOrgPicker(screen)

  // Create an organization from the picker. The URL is set explicitly so reruns don't collide.
  await screen.getByRole("menuitem", /Create organization/).tap()
  await expect(browser).toHaveURL(/\/new$/)
  await screen.getByLabel("Organization name").fill("Acme Labs")
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))
  await expect(screen.getByRole("heading", "Acme Labs")).toBeVisible()

  // Switch back to the personal organization: the URL and the page follow.
  await openOrgPicker(screen)
  await screen.getByRole("menuitem", /Ada Lovelace's workspace/).tap()
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+$/)

  // Theme: Dark from the account menu puts the dark class on the page.
  await openAccountMenu(screen)
  await screen.getByRole("menuitemradio", "Dark").tap()
  expect(await browser.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(
    true,
  )
  await browser.keyboard.press("Escape")

  // G then H goes to the organization home; Ctrl+K opens the command palette.
  await browser.keyboard.press("g")
  await browser.keyboard.press("h")
  await expect(browser).toHaveURL(/\/personal-[a-z0-9-]+$/)
  await browser.keyboard.press("Control+k")
  await expect(screen.getByRole("dialog", "Command palette")).toBeVisible()
})

/** At phone width the sidebar is a drawer: open it from the top bar when a sidebar control is hidden. */
async function revealSidebarControl(screen: Screen, control: Locator) {
  try {
    await expect(control).toBeVisible({ timeout: 2_000 })
  } catch {
    await screen.getByRole("button", "Open navigation").tap()
  }
}

async function openOrgPicker(screen: Screen) {
  const trigger = screen.getByRole("button", /Switch organization/)
  await revealSidebarControl(screen, trigger)
  await trigger.tap()
}

async function openAccountMenu(screen: Screen) {
  const trigger = screen.getByRole("button", /Account menu/)
  await revealSidebarControl(screen, trigger)
  await trigger.tap()
}
