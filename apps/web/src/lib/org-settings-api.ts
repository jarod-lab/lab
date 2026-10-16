import { createClient } from "@starter/auth/client"

import { WebError } from "./web-auth"

// The organization settings calls, kept apart from WebAuth so the other pages' fakes don't change.
// Every call names its organization explicitly: the session's active organization is not necessarily
// the one this page shows.

export interface OrgSettings {
  id: string
  name: string
  slug: string
  logo: string | null
  metadata: unknown
}

export interface OrgMember {
  id: string
  userId: string
  role: string
  name: string
  email: string
}

export interface OrgSettingsApi {
  getOrganization(organizationId: string): Promise<OrgSettings>
  listMembers(organizationId: string): Promise<{ total: number; members: OrgMember[] }>
  updateOrganization(
    organizationId: string,
    data: { name?: string; slug?: string; metadata?: Record<string, unknown> },
  ): Promise<OrgSettings>
  updateMemberRole(organizationId: string, memberId: string, role: string): Promise<void>
  leaveOrganization(organizationId: string): Promise<void>
  deleteOrganization(organizationId: string): Promise<void>
  /** Organization-owned API keys (all of them: the count is what the danger zone shows). */
  countApiKeys(organizationId: string): Promise<number>
  /**
   * Whether a stored role string may do every listed action, by the organization plugin's own check
   * against the permission catalog (no hand-written role table here).
   */
  roleAllows(role: string, permissions: Record<string, string[]>): boolean
}

type Result<T> = { data: T | null; error: { message?: string; status?: number } | null }

function unwrap<T>(result: Result<T>, fallback: string): T {
  if (result.error) {
    throw new WebError(result.error.message || fallback, result.error.status ?? 0)
  }
  return result.data as T
}

/** The browser implementation, same origin as the page (cookies go with every call). */
export function createOrgSettingsApi(baseURL?: string, fetchImpl?: typeof fetch): OrgSettingsApi {
  const client = createClient(baseURL, fetchImpl ? { customFetchImpl: fetchImpl } : undefined)
  const org = client.organization as unknown as {
    getFullOrganization: (args: unknown) => Promise<Result<OrgSettings>>
    listMembers: (args: unknown) => Promise<Result<{ total: number; members: unknown[] }>>
    update: (args: unknown) => Promise<Result<OrgSettings>>
    updateMemberRole: (args: unknown) => Promise<Result<unknown>>
    leave: (args: unknown) => Promise<Result<unknown>>
    delete: (args: unknown) => Promise<Result<unknown>>
    checkRolePermission: (args: unknown) => boolean
  }

  return {
    async getOrganization(organizationId) {
      const found = unwrap(
        await org.getFullOrganization({ query: { organizationId } }),
        "Could not load the organization",
      )
      return {
        id: found.id,
        name: found.name,
        slug: found.slug,
        logo: found.logo ?? null,
        metadata: found.metadata,
      }
    },
    async listMembers(organizationId) {
      const listed = unwrap(
        await org.listMembers({ query: { organizationId } }),
        "Could not load the members",
      )
      const members = (listed.members as Array<Record<string, unknown>>).map((member) => {
        const user = (member.user ?? {}) as { name?: string; email?: string }
        return {
          id: String(member.id),
          userId: String(member.userId),
          role: String(member.role),
          name: user.name ?? "",
          email: user.email ?? "",
        }
      })
      return { total: listed.total, members }
    },
    async updateOrganization(organizationId, data) {
      return unwrap(await org.update({ organizationId, data }), "Could not save the organization")
    },
    async updateMemberRole(organizationId, memberId, role) {
      unwrap(
        await org.updateMemberRole({ organizationId, memberId, role }),
        "Could not change the role",
      )
    },
    async leaveOrganization(organizationId) {
      unwrap(await org.leave({ organizationId }), "Could not leave the organization")
    },
    async deleteOrganization(organizationId) {
      unwrap(await org.delete({ organizationId }), "Could not delete the organization")
    },
    async countApiKeys(organizationId) {
      const result = await client.$fetch<{ total?: number }>("/api-key/list", {
        method: "GET",
        query: { organizationId, limit: 1 },
      })
      const body = unwrap(result, "Could not count the API keys")
      return body.total ?? 0
    },
    roleAllows(role, permissions) {
      return org.checkRolePermission({ role, permissions }) === true
    },
  }
}

let shared: OrgSettingsApi | undefined

/** The page's own settings API, created on first use in the browser. */
export function getOrgSettingsApi(): OrgSettingsApi {
  shared ??= createOrgSettingsApi(
    typeof window === "undefined" ? undefined : window.location.origin,
  )
  return shared
}
