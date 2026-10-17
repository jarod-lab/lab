import { createClient } from "@starter/auth/client"

import { organizationHeaders } from "./org-header"
import { WebError } from "./web-auth"

/** A member's security state, from list_member_security (member:read). */
export interface MemberSecurity {
  userId: string
  name: string
  email: string
  role: string
  twoFactorEnabled: boolean
  lastActiveAt: string | null
}

/** A pending or expired invitation, as better-auth lists it. */
export interface OrgInvitation {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string
  createdAt?: string
}

/**
 * Member and invitation calls for one page. Invitations, removal and role changes go through
 * better-auth's organization endpoints with the organization named explicitly; security and the
 * two-factor reset go through the product API (`/v1`) with X-Organization-Id.
 */
export interface MembersApi {
  listSecurity(organizationId: string): Promise<MemberSecurity[]>
  resetTwoFactor(organizationId: string, userId: string): Promise<void>
  listInvitations(organizationId: string): Promise<OrgInvitation[]>
  /** One address. `resend` re-sends (and renews the expiry) when the address already has an invitation. */
  invite(
    organizationId: string,
    input: { email: string; role: string; resend?: boolean },
  ): Promise<void>
  cancelInvitation(invitationId: string): Promise<void>
  removeMember(organizationId: string, memberIdOrEmail: string): Promise<void>
}

type Result<T> = { data: T | null; error: { message?: string; status?: number } | null }

function unwrap<T>(result: Result<T>, fallback: string): T {
  if (result.error) throw new WebError(result.error.message || fallback, result.error.status ?? 0)
  return result.data as T
}

async function productRequest<T>(
  fetchImpl: typeof fetch,
  organizationId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchImpl(`/v1${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...organizationHeaders(organizationId),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string; hint?: string }
    } | null
    const message = [body?.error?.message, body?.error?.hint].filter(Boolean).join(" ")
    throw new WebError(message || "Something went wrong", response.status)
  }
  return (await response.json()) as T
}

/** The browser implementation, same origin as the page. */
export function createMembersApi(baseURL?: string, fetchImpl?: typeof fetch): MembersApi {
  const fetchFn: typeof fetch = fetchImpl ?? ((...args) => fetch(...args))
  const client = createClient(baseURL, fetchImpl ? { customFetchImpl: fetchImpl } : undefined)
  const org = client.organization as unknown as {
    listInvitations: (args: unknown) => Promise<Result<OrgInvitation[]>>
    inviteMember: (args: unknown) => Promise<Result<unknown>>
    cancelInvitation: (args: unknown) => Promise<Result<unknown>>
    removeMember: (args: unknown) => Promise<Result<unknown>>
  }

  return {
    async listSecurity(organizationId) {
      const body = await productRequest<{ members: MemberSecurity[] }>(
        fetchFn,
        organizationId,
        "/members/security",
      )
      return body.members
    },
    async resetTwoFactor(organizationId, userId) {
      await productRequest<{ reset: true }>(
        fetchFn,
        organizationId,
        `/members/${encodeURIComponent(userId)}/two-factor/reset`,
        { method: "POST" },
      )
    },
    async listInvitations(organizationId) {
      return unwrap(
        await org.listInvitations({ query: { organizationId } }),
        "Could not load the invitations",
      )
    },
    async invite(organizationId, input) {
      unwrap(
        await org.inviteMember({
          organizationId,
          email: input.email,
          role: input.role,
          ...(input.resend ? { resend: true } : {}),
        }),
        "Could not send the invitation",
      )
    },
    async cancelInvitation(invitationId) {
      unwrap(await org.cancelInvitation({ invitationId }), "Could not cancel the invitation")
    },
    async removeMember(organizationId, memberIdOrEmail) {
      unwrap(
        await org.removeMember({ organizationId, memberIdOrEmail }),
        "Could not remove the member",
      )
    },
  }
}

let shared: MembersApi | undefined

/** The page's members API for the browser, created on first use. */
export function getMembersApi(): MembersApi {
  shared ??= createMembersApi(typeof window === "undefined" ? undefined : window.location.origin)
  return shared
}
