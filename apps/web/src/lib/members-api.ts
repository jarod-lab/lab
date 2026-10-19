import { payload, productClient, type ResponseBody } from "./product-client"
import { isOrgRole } from "./roles"
import { makeAuthClient, WebError } from "./web-auth"

/** A member's security state, from list_member_security (member:read). */
export type MemberSecurity = ResponseBody<"list_member_security">["members"][number]

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

/** The browser implementation, same origin as the page. */
export function createMembersApi(baseURL?: string, fetchImpl?: typeof fetch): MembersApi {
  const org = makeAuthClient(baseURL, fetchImpl).organization

  return {
    async listSecurity(organizationId) {
      return (await payload(productClient(organizationId, fetchImpl).GET("/v1/members/security")))
        .members
    },
    async resetTwoFactor(organizationId, userId) {
      await payload(
        productClient(organizationId, fetchImpl).POST("/v1/members/{userId}/two-factor/reset", {
          params: { path: { userId } },
        }),
      )
    },
    async listInvitations(organizationId) {
      const invitations = unwrap(
        await org.listInvitations({ query: { organizationId } }),
        "Could not load the invitations",
      )
      // The auth client revives dates; the page takes ISO strings.
      return invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: new Date(invitation.expiresAt).toISOString(),
        ...(invitation.createdAt && { createdAt: new Date(invitation.createdAt).toISOString() }),
      }))
    },
    async invite(organizationId, input) {
      if (!isOrgRole(input.role)) throw new WebError(`Unknown role: ${input.role}`, 0)
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
