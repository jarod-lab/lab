// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import type { OrgSecurityApi, SsoProvider } from "../lib/org-security-api"
import type { OrgSettingsApi } from "../lib/org-settings-api"
import { fakeAuth } from "../test/fake-auth"
import { renderWithClient } from "../test/render"
import { OrgSecurityContainer } from "./org-security"

const acme = { id: "org-a", name: "Acme Inc", slug: "acme" }

// The server's rules as the plugin states them: owner may read and change SSO and mint SCIM tokens.
const ALLOWED: Record<string, string[]> = {
  owner: ["sso:read", "sso:update", "scim:create"],
  admin: [],
  member: [],
  viewer: [],
}

function fakeOrgApi(): OrgSettingsApi {
  return {
    getOrganization: vi.fn(),
    listMembers: vi.fn(),
    updateOrganization: vi.fn(),
    updateMemberRole: vi.fn(),
    leaveOrganization: vi.fn(),
    deleteOrganization: vi.fn(),
    countApiKeys: vi.fn(),
    roleAllows: vi.fn((role: string, permissions: Record<string, string[]>) => {
      const granted = role.split(",").flatMap((part) => ALLOWED[part.trim()] ?? [])
      return Object.entries(permissions).every(([resource, actions]) =>
        actions.every((action: string) => granted.includes(`${resource}:${action}`)),
      )
    }),
  }
}

const existing: SsoProvider = {
  providerId: "acme-com-1",
  type: "oidc",
  issuer: "https://login.acme.com",
  domain: "acme.com",
  organizationId: "org-a",
  domainVerified: false,
}

function fakeSecurityApi(overrides: Partial<OrgSecurityApi> = {}): OrgSecurityApi {
  return {
    listSsoProviders: vi.fn(async () => [existing]),
    registerSsoProvider: vi.fn(async () => undefined),
    deleteSsoProvider: vi.fn(async () => undefined),
    requestDomainVerification: vi.fn(async () => "tok_domain_1"),
    verifyDomain: vi.fn(async () => undefined),
    generateScimToken: vi.fn(async () => ({ token: "scim_tok_1", expiresInDays: 365 })),
    ...overrides,
  }
}

function setup(options: { role?: string; securityApi?: OrgSecurityApi } = {}) {
  const auth = fakeAuth({ memberRole: vi.fn(async () => options.role ?? "owner") })
  const securityApi = options.securityApi ?? fakeSecurityApi()
  const rendered = renderWithClient(
    <OrgSecurityContainer
      auth={auth}
      api={fakeOrgApi()}
      securityApi={securityApi}
      organization={acme}
      origin="https://app.example.com"
    />,
  )
  return { auth, securityApi, ...rendered }
}

describe("OrgSecurityContainer", () => {
  it("lists the owner's providers", async () => {
    const { securityApi } = setup()
    const row = await screen.findByRole("listitem", { name: "acme.com" })
    expect(within(row).getByText("OpenID Connect")).toBeTruthy()
    expect(within(row).getByText("Domain not verified")).toBeTruthy()
    expect(securityApi.listSsoProviders).toHaveBeenCalledWith("org-a")
  })

  it("registers a provider with a generated id and the organization", async () => {
    const user = userEvent.setup()
    const securityApi = fakeSecurityApi({ listSsoProviders: vi.fn(async () => []) })
    setup({ securityApi })
    await screen.findByText(/No providers yet/)
    await user.click(screen.getByRole("button", { name: "Add a provider" }))
    await user.type(screen.getByLabelText("Email domain"), "globex.io")
    await user.type(screen.getByLabelText("Issuer URL"), "https://login.globex.io")
    await user.type(screen.getByLabelText("Client ID"), "client-123")
    await user.type(screen.getByLabelText("Client secret"), "s3cret")
    await user.click(screen.getByRole("button", { name: "Add provider" }))
    await waitFor(() => expect(securityApi.registerSsoProvider).toHaveBeenCalledTimes(1))
    const [orgId, providerId, values] =
      vi.mocked(securityApi.registerSsoProvider).mock.calls[0] ?? []
    expect(orgId).toBe("org-a")
    expect(providerId).toMatch(/^globex-io-[0-9a-f-]{8}$/)
    expect(values).toMatchObject({ domain: "globex.io", clientSecret: "s3cret" })
  })

  it("deletes a provider after confirmation", async () => {
    const user = userEvent.setup()
    const securityApi = fakeSecurityApi()
    setup({ securityApi })
    const row = await screen.findByRole("listitem", { name: "acme.com" })
    await user.click(within(row).getByRole("button", { name: "Delete provider" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Delete provider" }))
    await waitFor(() =>
      expect(securityApi.deleteSsoProvider).toHaveBeenCalledWith("org-a", "acme-com-1"),
    )
  })

  it("starts a domain check and shows the TXT record name and value", async () => {
    const user = userEvent.setup()
    const securityApi = fakeSecurityApi()
    setup({ securityApi })
    const row = await screen.findByRole("listitem", { name: "acme.com" })
    await user.click(within(row).getByRole("button", { name: "Verify domain" }))
    expect(securityApi.requestDomainVerification).toHaveBeenCalledWith("org-a", "acme-com-1")
    expect(await screen.findByLabelText("Record name")).toHaveProperty(
      "value",
      "_better-auth-token-acme-com-1.acme.com",
    )
    expect(screen.getByLabelText("Record value")).toHaveProperty("value", "tok_domain_1")
  })

  it("checks the record, and shows the server's reason while it is missing", async () => {
    const user = userEvent.setup()
    const securityApi = fakeSecurityApi({
      verifyDomain: vi.fn(async () => {
        throw new Error("Unable to verify domain ownership for acme.com. Try again later")
      }),
    })
    setup({ securityApi })
    const row = await screen.findByRole("listitem", { name: "acme.com" })
    await user.click(within(row).getByRole("button", { name: "Verify domain" }))
    await user.click(await screen.findByRole("button", { name: "Check now" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText(/Try again later/)).toBeTruthy()
    expect(securityApi.verifyDomain).toHaveBeenCalledWith("org-a", "acme-com-1")
  })

  it("shows the verified state once the check passes", async () => {
    const user = userEvent.setup()
    let verified = false
    const securityApi = fakeSecurityApi({
      listSsoProviders: vi.fn(async () => [{ ...existing, domainVerified: verified }]),
      verifyDomain: vi.fn(async () => {
        verified = true
      }),
    })
    setup({ securityApi })
    const row = await screen.findByRole("listitem", { name: "acme.com" })
    await user.click(within(row).getByRole("button", { name: "Verify domain" }))
    await user.click(await screen.findByRole("button", { name: "Check now" }))
    await waitFor(() => expect(within(row).getByText("Domain verified")).toBeTruthy())
    expect(within(row).queryByRole("button", { name: "Verify domain" })).toBeNull()
  })

  it("shows the SCIM token once, from state, and clears it on dismiss", async () => {
    const user = userEvent.setup()
    const securityApi = fakeSecurityApi()
    setup({ securityApi })
    await user.click(await screen.findByRole("button", { name: "Generate SCIM token" }))
    expect(securityApi.generateScimToken).toHaveBeenCalledWith("org-a")
    expect(await screen.findByLabelText("SCIM token")).toHaveProperty("value", "scim_tok_1")
    await user.click(screen.getByRole("button", { name: "I've copied it" }))
    expect(screen.queryByLabelText("SCIM token")).toBeNull()
  })

  it("shows a refused SCIM token request as an alert", async () => {
    const user = userEvent.setup()
    const securityApi = fakeSecurityApi({
      generateScimToken: vi.fn(async () => {
        throw new Error("Only an organization owner can generate a SCIM token")
      }),
    })
    setup({ securityApi })
    await user.click(await screen.findByRole("button", { name: "Generate SCIM token" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByText("Only an organization owner can generate a SCIM token")).toBeTruthy()
  })

  it("shows a read-only notice and asks for no provider data to a viewer", async () => {
    const securityApi = fakeSecurityApi()
    setup({ role: "viewer", securityApi })
    expect(await screen.findByRole("region", { name: "View-only access" })).toBeTruthy()
    expect(securityApi.listSsoProviders).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Generate SCIM token" })).toBeNull()
  })

  it("shows a loading state until the role is known", () => {
    setup()
    expect(screen.getByText("Loading…")).toBeTruthy()
  })
})
