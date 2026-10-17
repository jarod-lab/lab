import { TWO_FACTOR_PATH, createClient } from "@starter/auth/client"

import { rawSearch } from "./navigation"

/** An auth call that the server refused, with the message to show the person. */
export class WebError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "WebError"
    this.status = status
  }
}

export interface WebSession {
  user: { id: string; email: string; name: string }
  activeOrganizationId: string | null
}

export interface WebOrganization {
  id: string
  name: string
  slug: string
}

/** The roles better-auth stores on a membership, lowercased. Custom roles may be added later. */
export type MemberRole = string

export interface WebInvitation {
  id: string
  organizationName: string
  email: string
  role: string
  status: string
}

export interface DeviceLookup {
  status: "pending" | "approved" | "denied" | (string & {})
  clientId?: string
  scope?: string
}

/**
 * Everything the pages need from the server. Pages take this as a prop, so tests pass a fake and
 * the routes pass `getWebAuth()`. Methods that start an OAuth step resolve with the URL to continue
 * to (or `undefined` when there is none).
 */
export interface WebAuth {
  getSession(): Promise<WebSession | null>
  signIn(input: { email: string; password: string }): Promise<string | undefined>
  signUp(input: { name: string; email: string; password: string }): Promise<string | undefined>
  /** End the current session (the person is not who the page expects, or wants to switch). */
  signOut(): Promise<void>
  listOrganizations(): Promise<WebOrganization[]>
  /** The caller's role(s) in one organization, comma-separated when there are several. */
  memberRole(organizationId: string): Promise<MemberRole>
  /** True when the slug is free. Rejects other slugs (bad shape or taken) with `false`. */
  checkSlug(slug: string): Promise<boolean>
  createOrganization(input: { name: string; slug: string }): Promise<WebOrganization>
  setActiveOrganization(organizationId: string): Promise<void>
  /** The display name of an OAuth client, or null when it has none. */
  getClientName(clientId: string): Promise<string | null>
  /** Accept (true) or deny (false) the pending authorization for the active organization. */
  consent(accept: boolean): Promise<string | undefined>
  /** Resume the OAuth flow after the organization is chosen (`POST /oauth2/continue`). */
  continueOAuth(): Promise<string | undefined>
  getInvitation(invitationId: string): Promise<WebInvitation>
  acceptInvitation(invitationId: string): Promise<void>
  resetPassword(input: { token: string; newPassword: string }): Promise<void>
  device: {
    lookup(userCode: string): Promise<DeviceLookup>
    approve(userCode: string): Promise<void>
    deny(userCode: string): Promise<void>
  }
}

/** OAuth-style errors (device, consent) carry `error_description`; better-auth's own carry `message`. */
type Failable = {
  data: unknown
  error: { message?: string; error_description?: string; status?: number } | null
}

const unwrap = <T>(result: Failable, fallback: string): T => {
  if (result.error) {
    const message = result.error.message || result.error.error_description || fallback
    throw new WebError(message, result.error.status ?? 0)
  }
  return result.data as T
}

const urlFrom = (body: { url?: string; redirect_uri?: string } | null | undefined) =>
  body?.url ?? body?.redirect_uri ?? undefined

/**
 * The browser implementation. Same-origin: the API serves these pages, so `baseURL` is the page's
 * origin and session cookies go with every request. The client's OAuth fetch plugin adds the page's
 * signed query to sign-in, sign-up, consent and continue, which is how those requests resume the flow.
 */
export function createWebAuth(baseURL?: string, fetchImpl?: typeof fetch): WebAuth {
  // Only set when given: an explicit undefined would replace better-auth's default fetch.
  const client = createClient(baseURL, fetchImpl ? { customFetchImpl: fetchImpl } : undefined)

  return {
    async getSession() {
      const result = await client.getSession()
      if (!result.data) return null
      const { user, session } = result.data
      return {
        user: { id: user.id, email: user.email, name: user.name },
        activeOrganizationId:
          (session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null,
      }
    },
    async signIn(input) {
      const data = unwrap<{ url?: string; twoFactorRedirect?: boolean } | null>(
        await client.signIn.email(input),
        "Could not sign in",
      )
      // A second factor is still due: the client has already sent the browser to /two-factor, keeping
      // this page's query. Answer with that same address so the caller doesn't navigate elsewhere.
      if (data?.twoFactorRedirect) return `${TWO_FACTOR_PATH}${rawSearch()}`
      return data?.url ?? undefined
    },
    async signUp(input) {
      const data = unwrap<{ url?: string } | null>(
        await client.signUp.email(input),
        "Could not create the account",
      )
      return data?.url ?? undefined
    },
    async signOut() {
      unwrap(await client.signOut(), "Could not sign out")
    },
    async listOrganizations() {
      const orgs = unwrap<Array<{ id: string; name: string; slug: string }>>(
        await client.organization.list(),
        "Could not load organizations",
      )
      return orgs.map((org) => ({ id: org.id, name: org.name, slug: org.slug }))
    },
    async memberRole(organizationId) {
      // Explicit organizationId: the session's active org is not necessarily the one asked about.
      const body = unwrap<{ role: string }>(
        await client.organization.getActiveMemberRole({ query: { organizationId } }),
        "Could not load your role",
      )
      return body.role
    },
    async checkSlug(slug) {
      const result = await client.organization.checkSlug({ slug })
      if (!result.error) return true
      // better-auth answers a taken slug with BAD_REQUEST and this code (organization/check-slug).
      const code = (result.error as { code?: string }).code
      if (code === "ORGANIZATION_SLUG_ALREADY_TAKEN") return false
      throw new WebError(
        result.error.message || "Could not check the address",
        result.error.status ?? 0,
      )
    },
    async createOrganization(input) {
      const org = unwrap<{ id: string; name: string; slug: string }>(
        await client.organization.create(input),
        "Could not create the organization",
      )
      return { id: org.id, name: org.name, slug: org.slug }
    },
    async setActiveOrganization(organizationId) {
      unwrap(
        await client.organization.setActive({ organizationId }),
        "Could not switch organization",
      )
    },
    async getClientName(clientId) {
      const result = await client.$fetch<{ client_name?: string }>("/oauth2/public-client", {
        method: "GET",
        query: { client_id: clientId },
      })
      return (
        unwrap<{ client_name?: string }>(result, "Could not load the application").client_name ??
        null
      )
    },
    async consent(accept) {
      const result = await client.$fetch<{ url?: string; redirect_uri?: string }>(
        "/oauth2/consent",
        { method: "POST", body: { accept } },
      )
      return urlFrom(unwrap(result, "Could not record your answer"))
    },
    async continueOAuth() {
      const result = await client.$fetch<{ url?: string; redirect_uri?: string }>(
        "/oauth2/continue",
        { method: "POST", body: { postLogin: true } },
      )
      return urlFrom(unwrap(result, "Could not continue"))
    },
    async getInvitation(invitationId) {
      const invitation = unwrap<{
        id: string
        organizationName: string
        email: string
        role: string
        status: string
      }>(
        await client.organization.getInvitation({ query: { id: invitationId } }),
        "This invitation could not be found",
      )
      return {
        id: invitation.id,
        organizationName: invitation.organizationName,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
      }
    },
    async acceptInvitation(invitationId) {
      unwrap(
        await client.organization.acceptInvitation({ invitationId }),
        "Could not accept the invitation",
      )
    },
    async resetPassword(input) {
      unwrap(await client.resetPassword(input), "This link is invalid or has expired")
    },
    device: {
      async lookup(userCode) {
        const result = await client.$fetch<{ status: string; client_id?: string; scope?: string }>(
          "/device",
          { method: "GET", query: { user_code: userCode } },
        )
        const body = unwrap<{ status: string; client_id?: string; scope?: string }>(
          result,
          "That code was not recognised",
        )
        return { status: body.status, clientId: body.client_id, scope: body.scope }
      },
      async approve(userCode) {
        unwrap(
          await client.$fetch("/device/approve", { method: "POST", body: { userCode } }),
          "Could not approve the request",
        )
      },
      async deny(userCode) {
        unwrap(
          await client.$fetch("/device/deny", { method: "POST", body: { userCode } }),
          "Could not deny the request",
        )
      },
    },
  }
}

let shared: WebAuth | undefined

/** The page's own auth, created on first use in the browser (`window` is not there at build time). */
export function getWebAuth(): WebAuth {
  shared ??= createWebAuth(typeof window === "undefined" ? undefined : window.location.origin)
  return shared
}
