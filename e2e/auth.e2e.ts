import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { PASSWORD, acceptInvitationAs, inviteAs, signOutUi, signUpUi } from "./support/invitations"
import { mailLinkTo, pathAndQuery } from "./support/mail"
import { totpAt } from "./support/totp"
import { uniqueId } from "./support/unique"

// The public auth pages (docs/build-app/boards/project/Auth): sign-up with a breached password refused
// in place, sign-in by emailed link, a sign-in that asks for the authenticator code, and an invitation
// accepted by a new person. Locators, the dev mail sink (GET /api/dev/mail) and the page's own calls only.
// Passkeys and social sign-in can't run here (no WebAuthn, no provider credentials).

const ACCOUNT_HOME = /\/personal-[a-z0-9-]+\/settings\/agents$/

/**
 * Whether the breach database answers from this runner. The breached-password step needs it: without it
 * the server cannot refuse the password, so that step is skipped (the rest of the journey still runs).
 */
async function breachCheckReachable(): Promise<boolean> {
  try {
    await fetch("https://api.pwnedpasswords.com/range/00000", {
      signal: AbortSignal.timeout(5_000),
    })
    return true
  } catch {
    return false
  }
}

test("sign-up refuses a breached password in place, then creates the account with a good one", async (ctx) => {
  const { app, screen, browser } = ctx
  const email = `grace.${uniqueId()}@example.com`

  await app.open("/sign-up")
  await screen.getByLabel("Name").fill("Grace Hopper")
  await screen.getByLabel("Work email").fill(email)

  if (await breachCheckReachable()) {
    await screen.getByLabel("Password").fill("Summer2024!")
    await screen.getByRole("button", "Create account").tap()
    await expect(
      screen.getByText(
        "This password has shown up in a known data breach. Choose a different one.",
      ),
    ).toBeVisible()
    await expect(browser).toHaveURL(/\/sign-up/)
  } else {
    // Unreachable from this runner: the breached-password step is skipped, not faked.
  }

  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Create account").tap()
  await expect(browser).toHaveURL(ACCOUNT_HOME)
})

test("sign in by emailed link", async (ctx) => {
  const { app, screen, browser } = ctx
  const email = `lin.${uniqueId()}@example.com`

  await signUpUi(ctx, "Lin Park", email)
  await signOutUi(ctx)

  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(email)
  await screen.getByRole("button", "Email me a sign-in link").tap()
  await expect(screen.getByRole("heading", "Check your email")).toBeVisible()

  await expect.poll(() => mailLinkTo(app, email, /magic-link\/verify/)).not.toBeNull()
  const link = await mailLinkTo(app, email, /magic-link\/verify/)
  if (!link) throw new Error(`no sign-in link reached ${email}`)
  await app.open(pathAndQuery(link))
  await expect(browser).toHaveURL(ACCOUNT_HOME)
})

test("forgot password: request a link, set a new password from the email, sign in with it", async (ctx) => {
  const { app, screen, browser } = ctx
  const email = `reset.${uniqueId()}@example.com`
  const newPassword = "a new passphrase for the reset journey 7"

  await signUpUi(ctx, "Reset Person", email)
  await signOutUi(ctx)

  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(email)
  await screen.getByRole("button", "Forgot password?").tap()
  await screen.getByRole("button", "Send reset link").tap()
  await expect(screen.getByRole("heading", "Check your email")).toBeVisible()

  await expect.poll(() => mailLinkTo(app, email, /\/reset-password\//)).not.toBeNull()
  const link = await mailLinkTo(app, email, /\/reset-password\//)
  if (!link) throw new Error(`no reset link reached ${email}`)
  await app.open(pathAndQuery(link))
  await screen.getByLabel("New password").fill(newPassword)
  await screen.getByLabel("Confirm password").fill(newPassword)
  await screen.getByRole("button", "Set password").tap()
  await expect(screen.getByText("Your password is set. Sign in with it.")).toBeVisible()

  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(email)
  await screen.getByLabel("Password").fill(newPassword)
  await screen.getByRole("button", "Sign in with email").tap()
  await expect(browser).toHaveURL(ACCOUNT_HOME)
})

test("two-factor: the password is not enough, the authenticator code is", async (ctx) => {
  const { app, screen, browser } = ctx
  const email = `ada.${uniqueId()}@example.com`

  await signUpUi(ctx, "Ada Lovelace", email)

  // Turn two-factor on from the security page (the same steps its own journey uses).
  await app.open("/account/security")
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
  await expect(screen.getByRole("heading", "Save your backup codes")).toBeVisible()
  await screen.getByRole("button", "I've saved them").tap()

  await signOutUi(ctx)
  await app.open("/sign-in")
  await screen.getByLabel("Email").fill(email)
  await screen.getByLabel("Password").fill(PASSWORD)
  await screen.getByRole("button", "Sign in with email").tap()
  await expect(browser).toHaveURL(/\/two-factor/)

  await screen.getByLabel("Code").fill(totpAt(secret))
  await screen.getByRole("button", "Verify").tap()
  await expect(browser).toHaveURL(ACCOUNT_HOME)
})

test("a new person accepts an invitation as a viewer", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = uniqueId()
  const ownerEmail = `ada.${unique}@example.com`
  const inviteeEmail = `kim.${unique}@example.com`
  const slug = `auth-${unique}`
  const orgName = "Auth Journey Ltd"

  await signUpUi(ctx, "Ada Lovelace", ownerEmail)
  await app.open("/new")
  await screen.getByLabel("Organization name").fill(orgName)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  const link = await inviteAs(ctx, { slug, email: inviteeEmail, role: "viewer" })
  await signOutUi(ctx)
  await acceptInvitationAs(ctx, {
    link,
    name: "Kim Osei",
    email: inviteeEmail,
    organizationName: orgName,
  })
})
