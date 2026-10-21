import type { SupportAgent, SupportInboxLabels, SupportLabels } from "@byo-oss/support/react"

import { type OrgSettingsApi, getOrgSettingsApi } from "./org-settings-api"
import { type WebAuth, WebError, getWebAuth } from "./web-auth"

// Customer support (@byo-oss/support, docs/support.md). The widget and the support queue call
// support's own endpoints through `WebAuth.support`; support decides who is staff and who is a
// customer. These calls only tell the page what to show, and fill the queue's staff pickers.

/** What makes someone support staff in the staff organization: support's own `isAgent` check. */
export const SUPPORT_STAFF = { support: ["read"] }

/** Where the support queue lives in the admin console. */
export const SUPPORT_QUEUE_PATH = "/admin/support"
/** The requester's support page: their tickets, and one ticket's thread under it. */
export const SUPPORT_TICKETS_PATH = "/account/support"

/**
 * The support queue's words, where this app's differ from the package's (GLOSSARY.md: "support
 * queue", not "inbox"). The widget's defaults already fit, and neither component shows "agent".
 */
export const SUPPORT_QUEUE_LABELS = {
  queue: "Support queue",
} satisfies Partial<SupportLabels & SupportInboxLabels>

export type SupportQueueAccess = "staff" | "not-staff" | "signed-out"

export interface SupportApi {
  /**
   * Whether the person's role in the staff organization holds `support:read`, for the console's
   * Support tab. A convenience: support's endpoints decide every call.
   */
  isStaff(organizationId: string): Promise<boolean>
  /** The support staff (members whose role holds `support:read`), for the queue's pickers. */
  listStaff(organizationId: string): Promise<SupportAgent[]>
  /**
   * Support's own answer to whether this session may work the queue, asked before the queue renders
   * (it would show a generic load error to anyone refused): 401 signed out; 403 not staff, an
   * impersonated session (guards.ts) or no staff organization configured.
   */
  queueAccess(): Promise<SupportQueueAccess>
}

/**
 * Built on better-auth's organization endpoints, through the pages' existing APIs: the caller's
 * role, the members list and the organization plugin's own permission check. No new route. The
 * queue check asks the cheapest staff endpoint, support's tag list.
 */
export function createSupportApi(
  auth: Pick<WebAuth, "memberRole" | "support">,
  org: Pick<OrgSettingsApi, "listMembers" | "roleAllows">,
): SupportApi {
  return {
    async isStaff(organizationId) {
      try {
        return org.roleAllows(await auth.memberRole(organizationId), SUPPORT_STAFF)
      } catch {
        // Not a member (or the lookup failed): no tab. The queue would refuse them anyway.
        return false
      }
    },
    async listStaff(organizationId) {
      let page = await org.listMembers(organizationId)
      // better-auth answers one page (100 by default); a bigger staff organization asks for all.
      if (page.members.length < page.total) page = await org.listMembers(organizationId, page.total)
      return page.members
        .filter((member) => org.roleAllows(member.role, SUPPORT_STAFF))
        .map((member) => ({
          id: member.userId,
          name: member.name || member.email,
          image: member.image ?? null,
        }))
    },
    async queueAccess() {
      if (!auth.support) return "not-staff"
      const { error } = await auth.support.support.agent.tags()
      if (!error) return "staff"
      const status = (error as { status?: number }).status ?? 0
      if (status === 401) return "signed-out"
      if (status === 403) return "not-staff"
      throw new WebError("Could not check your support access", status)
    },
  }
}

let shared: SupportApi | undefined

/** The page's support API, created on first use in the browser. */
export function getSupportApi(): SupportApi {
  shared ??= createSupportApi(getWebAuth(), getOrgSettingsApi())
  return shared
}

export const supportKeys = {
  /** Whether the person is support staff in the staff organization (the console's tab). */
  staff: (organizationId: string) => ["support", "staff", organizationId] as const,
  /** The staff list for the queue's pickers. */
  staffList: (organizationId: string) => ["support", "staff-list", organizationId] as const,
  /** Whether support's own staff check lets this session open the queue. */
  queueAccess: () => ["support", "queue-access"] as const,
}
