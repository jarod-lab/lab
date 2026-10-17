import { createClient } from "@starter/auth/client"

import { ssoRegisterBody } from "./org-security"
import type { SsoFormValues } from "./org-security"
import { WebError } from "./web-auth"

// The organization's Security calls: SSO providers (the sso plugin) and the SCIM token (starter's
// owner-only endpoint). Every call names its organization. The server allows them to the owner alone.

export interface SsoProvider {
  providerId: string
  type: "oidc" | "saml"
  issuer: string
  domain: string
  organizationId: string | null
  domainVerified: boolean
}

export interface ScimToken {
  token: string
  expiresInDays: number
}

export interface OrgSecurityApi {
  /** The providers registered to this organization (the plugin returns the caller's; this keeps this org's). */
  listSsoProviders(organizationId: string): Promise<SsoProvider[]>
  registerSsoProvider(
    organizationId: string,
    providerId: string,
    values: SsoFormValues,
  ): Promise<void>
  deleteSsoProvider(organizationId: string, providerId: string): Promise<void>
  /** Asks for the TXT token that proves the provider's domain. Asking again returns the live token. */
  requestDomainVerification(organizationId: string, providerId: string): Promise<string>
  /** Looks for the TXT record. Rejects with the server's message while it is not there. */
  verifyDomain(organizationId: string, providerId: string): Promise<void>
  /** Mints a SCIM token. The secret is returned once and never read back. */
  generateScimToken(organizationId: string): Promise<ScimToken>
}

type Failure = { message?: string; status?: number }
type Result<T> = { data: T | null; error: Failure | null }

function unwrap<T>(result: Result<T>, fallback: string): T {
  if (result.error) {
    throw new WebError(result.error.message || fallback, result.error.status ?? 0)
  }
  return result.data as T
}

/** The browser implementation, same origin as the page (cookies go with every call). */
export function createOrgSecurityApi(baseURL?: string, fetchImpl?: typeof fetch): OrgSecurityApi {
  const client = createClient(baseURL, fetchImpl ? { customFetchImpl: fetchImpl } : undefined)

  return {
    async listSsoProviders(organizationId) {
      const body = unwrap(
        await client.$fetch<{ providers: SsoProvider[] }>("/sso/providers", { method: "GET" }),
        "Could not load the single sign-on providers",
      )
      return body.providers.filter((provider) => provider.organizationId === organizationId)
    },
    async registerSsoProvider(organizationId, providerId, values) {
      unwrap(
        await client.$fetch("/sso/register", {
          method: "POST",
          body: ssoRegisterBody(organizationId, providerId, values),
        }),
        "Could not add the provider",
      )
    },
    async deleteSsoProvider(organizationId, providerId) {
      unwrap(
        await client.$fetch("/sso/delete-provider", {
          method: "POST",
          body: { organizationId, providerId },
        }),
        "Could not delete the provider",
      )
    },
    async requestDomainVerification(organizationId, providerId) {
      const body = unwrap(
        await client.$fetch<{ domainVerificationToken: string }>(
          "/sso/request-domain-verification",
          { method: "POST", body: { organizationId, providerId } },
        ),
        "Could not start the domain check",
      )
      return body.domainVerificationToken
    },
    async verifyDomain(organizationId, providerId) {
      unwrap(
        await client.$fetch("/sso/verify-domain", {
          method: "POST",
          body: { organizationId, providerId },
        }),
        "Could not verify the domain",
      )
    },
    async generateScimToken(organizationId) {
      const body = unwrap(
        await client.$fetch<ScimToken>("/scim/generate-token", {
          method: "POST",
          body: { organizationId },
        }),
        "Could not generate a SCIM token",
      )
      return { token: body.token, expiresInDays: body.expiresInDays }
    },
  }
}

let shared: OrgSecurityApi | undefined

/** The page's own security API, created on first use in the browser. */
export function getOrgSecurityApi(): OrgSecurityApi {
  shared ??= createOrgSecurityApi(
    typeof window === "undefined" ? undefined : window.location.origin,
  )
  return shared
}
