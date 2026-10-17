import { test } from "@e2e-dev/web"
import { expect } from "e2e"

import { acceptInvitationAs, inviteAs, signOutUi, signUpUi } from "./support/invitations"

// The organization's Security page (no board; plain D+): the owner adds a single sign-on provider for a test
// domain and sees it listed, mints a SCIM token that is shown once, and deletes the provider with its
// consequence named. A viewer of the same organization sees only the view-only notice. Locators only.
//
// The provider is SAML: the plugin fetches an OIDC issuer's discovery document from a public host, which a
// test cannot provide, so OIDC registration cannot pass here. SAML registration is local. The certificate is a
// throwaway self-signed test certificate (its key is not kept).
const IDP_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBjjCCATOgAwIBAgIUMqVqOScECR4NMcSGlJGmOHojjgUwCgYIKoZIzj0EAwIw
GzEZMBcGA1UEAwwQaWRwLmV4YW1wbGUudGVzdDAgFw0yNjEwMTcwMDU1MzJaGA8y
MTI2MDkyMzAwNTUzMlowGzEZMBcGA1UEAwwQaWRwLmV4YW1wbGUudGVzdDBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABLH+L92fyXE6aobUOkE/cI0orwfwHQsVJQjc
OBWVcAj4UcwAm0/cPMbowUol3E6PZDnjXwzKhRphAon5rhCWWEWjUzBRMB0GA1Ud
DgQWBBS0YEWa4xiZch/AkHYfOSGJ6IS+2TAfBgNVHSMEGDAWgBS0YEWa4xiZch/A
kHYfOSGJ6IS+2TAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0kAMEYCIQCB
uhiUHrI2ejdhOHz/SSOAht5n6e3nFw6xJ9YOVMp9bAIhAMRkouwgdRjP2lFp3B2R
fWk+dZfXrsawRY6EGVESXv0A
-----END CERTIFICATE-----`

test("owner adds an SSO provider, mints a SCIM token once, deletes the provider; a viewer sees read-only", async (ctx) => {
  const { app, screen, browser } = ctx
  const unique = Date.now().toString(36)
  const ownerEmail = `ada.${unique}@example.com`
  const viewerEmail = `vee.${unique}@example.com`
  const slug = `security-${unique}`
  const orgName = "Security Ltd"
  const domain = `sso-${unique}.test`

  await signUpUi(ctx, "Ada Lovelace", ownerEmail)

  await app.open("/new")
  await screen.getByLabel("Organization name").fill(orgName)
  await screen.getByLabel("URL").fill(slug)
  await expect(screen.getByText("Available")).toBeVisible()
  await screen.getByRole("button", "Create organization").tap()
  await expect(browser).toHaveURL(new RegExp(`/${slug}$`))

  // The Security tab, empty to start.
  await app.open(`/${slug}/settings/security`)
  await expect(screen.getByRole("heading", "Single sign-on")).toBeVisible()
  await expect(screen.getByText(/No providers yet/)).toBeVisible()

  // Add a SAML provider for the test domain.
  await screen.getByRole("button", "Add a provider").tap()
  await screen.getByLabel("Protocol").selectOption({ value: "saml" })
  await screen.getByLabel("Email domain").fill(domain)
  await screen.getByLabel("Issuer URL").fill(`https://idp.${domain}/`)
  await screen.getByLabel("Single sign-on URL").fill(`https://idp.${domain}/sso/saml`)
  await screen.getByLabel("Signing certificate").fill(IDP_CERTIFICATE)
  await screen.getByRole("button", "Add provider").tap()

  // Listed, with its protocol and verification status.
  const row = screen.getByRole("listitem", { name: domain })
  await expect(row).toBeVisible()
  await expect(row.getByText("SAML 2.0")).toBeVisible()
  await expect(row.getByText("Domain not verified")).toBeVisible()

  // Verify the domain: the TXT record is shown with its name and value. Nothing is in DNS for this test
  // domain, so checking now is refused and says so.
  await row.getByRole("button", "Verify domain").tap()
  const panel = screen.getByRole("region", "Domain verification")
  // The panel appears once the server has issued the record: wait for it before reading the fields.
  await expect(panel).toBeVisible()
  const recordName = await panel.getByLabel("Record name").inputValue()
  expect(recordName).toMatch(
    new RegExp(`^_better-auth-token-.+\\.${domain.replace(/\./g, "\\.")}$`),
  )
  expect((await panel.getByLabel("Record value").inputValue()).length).toBeGreaterThan(16)
  await panel.getByRole("button", "Check now").tap()
  await expect(panel.getByRole("alert")).toBeVisible()
  await panel.getByRole("button", "Close").tap()
  await expect(row.getByRole("button", "Verify domain")).toBeVisible()

  // SCIM: the token appears once, with the base URL on the page.
  await expect(screen.getByLabel("SCIM base URL")).toBeVisible()
  await screen.getByRole("button", "Generate SCIM token").tap()
  await expect(screen.getByText("You won't see it again. Copy it now.")).toBeVisible()
  await expect(screen.getByLabel("SCIM token")).toBeVisible()
  await screen.getByRole("button", "I've copied it").tap()
  await expect(screen.getByLabel("SCIM token")).toBeHidden()
  await expect(screen.getByRole("button", "Generate SCIM token")).toBeVisible()

  // Reloading does not bring the token back.
  await app.open(`/${slug}/settings/security`)
  await expect(screen.getByRole("listitem", { name: domain })).toBeVisible()
  await expect(screen.getByLabel("SCIM token")).toBeHidden()

  // Delete: the consequence is named, and nothing happens until the dialog is confirmed.
  await screen.getByRole("listitem", { name: domain }).getByRole("button", "Delete provider").tap()
  const dialog = screen.getByRole("alertdialog")
  await expect(
    dialog.getByText(`People at ${domain} can no longer sign in with SSO.`),
  ).toBeVisible()
  await dialog.getByRole("button", "Delete provider").tap()
  await expect(screen.getByRole("listitem", { name: domain })).toBeHidden()
  await expect(screen.getByText(/No providers yet/)).toBeVisible()

  // A viewer of the organization: the page is a view-only notice, with no provider or SCIM controls.
  const viewerLink = await inviteAs(ctx, { slug, email: viewerEmail, role: "viewer" })
  await signOutUi(ctx)
  await acceptInvitationAs(ctx, {
    link: viewerLink,
    name: "Vee Viewer",
    email: viewerEmail,
    organizationName: orgName,
  })
  await app.open(`/${slug}/settings/security`)
  await expect(screen.getByText(`You have view-only access to ${orgName}.`)).toBeVisible()
  await expect(screen.getByRole("button", "Add a provider")).toBeHidden()
  await expect(screen.getByRole("button", "Generate SCIM token")).toBeHidden()
})
