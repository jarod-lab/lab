import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { signOutUi, signUpUi } from "./support/invitations"
import { totpAt } from "./support/totp"
import { uniqueId } from "./support/unique"

// The personal security page (docs/build-app/boards/project/Security): two-factor on with the setup key
// (the code is computed here, as an authenticator app would), a sign-in that asks for the code, new backup
// codes, signing out the other sessions, and a password change refused when it has been breached.
// Passkeys can't run here (no WebAuthn); their list and rename are unit-tested. Locators, the dev mail sink
// and the page's own calls only.

const PASSWORD = "correct horse battery staple 42"

test("two-factor on, sign in with a code, backup codes, sign out other sessions", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const email = `ada.${unique}@example.com`

  await signUpUi(ctx, "Ada Lovelace", email)

  // A second session, made the way another browser would: the sign-in API with the same password.
  // It is made before two-factor is on, so it needs no code.
  if (!app.baseUrl) throw new Error("the app has no base URL")
  const other = await fetch(new URL("/api/auth/sign-in/email", app.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin: app.baseUrl },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  expect(other.status).toBe(200)

  await app.open("/account/security")
  await expect(screen.getByRole("heading", "Where you're signed in")).toBeVisible()
  await expect(screen.getByText("Two-factor off")).toBeVisible()
  await expect(screen.getByText("This device")).toBeVisible()

  // Two-factor on: the password, then the setup key, then a code from the app (computed from the key).
  await screen.getByRole("button", "Turn on").tap()
  const start = screen.getByRole("dialog")
  await start.getByLabel("Password").fill(PASSWORD)
  await start.getByRole("button", "Continue").tap()
  // The dialog swaps to the setup key after the password check: wait for it, then read it.
  const setupKey = screen.getByLabel("Setup key")
  await expect(setupKey).toBeVisible()
  const secret = await setupKey.inputValue()
  await screen.getByLabel("Six-digit code from the app").fill(totpAt(secret))
  await screen.getByRole("dialog").getByRole("button", "Turn on").tap()

  // The backup codes are shown once, here.
  await expect(screen.getByRole("heading", "Save your backup codes")).toBeVisible()
  await screen.getByRole("button", "I've saved them").tap()
  await expect(screen.getByText("Two-factor on")).toBeVisible()
  await expect(screen.getByText("10 of 10 left · each works once")).toBeVisible()

  // Sign out, then sign in: the password is not enough, the page asks for the code.
  await signOutUi(ctx)
  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Sign in with email").tap()
  await expect(browser).toHaveURL(/\/two-factor/)
  await screen.getByLabel("Code").fill(totpAt(secret))
  await screen.getByRole("button", "Verify").tap()
  await expect(browser).not.toHaveURL(/\/two-factor/)

  // New backup codes replace the old ones; the count follows.
  await app.open("/account/security")
  await screen.getByRole("button", "Make new codes").tap()
  await screen.getByRole("dialog").getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("dialog").getByRole("button", "Make new codes").tap()
  await expect(screen.getByRole("heading", "Your new backup codes")).toBeVisible()
  await screen.getByRole("button", "I've saved them").tap()

  // The other session (the one made through the API) is listed; signing it out leaves this one.
  await expect(screen.getByText("This device")).toBeVisible()
  await screen.getByRole("button", "Sign out everywhere else").tap()
  await screen.getByRole("alertdialog").getByRole("button", "Sign out others").tap()
  // Only this device is left: no per-session "Sign out <device>" button remains. Counted rather than
  // located, since several match while the list refreshes.
  await expect
    .poll(
      () =>
        browser.evaluate(
          () =>
            [...document.querySelectorAll("button")].filter((b) =>
              /^Sign out (?!everywhere)/.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
            ).length,
        ),
      { timeout: 10_000 },
    )
    .toBe(0)
  await expect(screen.getByText("This device")).toBeVisible()

  // Connected accounts: this stack has no GitHub or Google set up. The page offers only the providers the
  // server reports (f51e235), so no connect button is shown.
  await expect(screen.getByRole("region", "Connected accounts")).toBeVisible()
  await expect(screen.getByRole("button", "Connect")).toBeHidden()

  // Password: the change is refused when the new one is in a known breach. Checked only when the
  // server reaches Have I Been Pwned; when it can't, that assertion is skipped (the server then allows it).
  const breachReachable = await fetch("https://api.pwnedpasswords.com/range/5BAA6", {
    signal: AbortSignal.timeout(5_000),
  })
    .then((response) => response.ok)
    .catch(() => false)
  if (breachReachable) {
    await screen.getByRole("button", "Change password").tap()
    const dialog = screen.getByRole("dialog")
    await dialog.getByLabel("Current password").fill(PASSWORD)
    await dialog.getByLabel("New password").fill("password")
    await dialog.getByLabel("Confirm new password").fill("password")
    await dialog.getByRole("button", "Change password").tap()
    await expect(
      dialog.getByText(
        "This password has shown up in a known data breach. Choose a different one.",
      ),
    ).toBeVisible()
  }
})
