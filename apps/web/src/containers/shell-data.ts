import type { OrgRole, OrgSummary } from "@starter/ui/dplus/shell/org-picker"
import {
  type QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { qk } from "../lib/query-keys"
import type { WebAuth, WebOrganization, WebSession } from "../lib/web-auth"

// Query functions are plain objects so the route guards and the containers share one definition
// (the guards call `ensureQueryData`, the containers call `useQuery`).

export const sessionQuery = (auth: WebAuth) => ({
  queryKey: qk.session(),
  queryFn: () => auth.getSession(),
})

export const organizationsQuery = (auth: WebAuth) => ({
  queryKey: qk.organizations(),
  queryFn: () => auth.listOrganizations(),
})

export const memberRoleQuery = (auth: WebAuth, organizationId: string) => ({
  queryKey: qk.org(organizationId).role(),
  queryFn: () => auth.memberRole(organizationId),
})

export function useSessionQuery(auth: WebAuth) {
  return useQuery(sessionQuery(auth))
}

export function useOrganizationsQuery(auth: WebAuth) {
  return useQuery(organizationsQuery(auth))
}

/** Each organization's role for the caller, keyed by organization id. Roles load one org at a time. */
export function useMemberRoles(auth: WebAuth, organizations: WebOrganization[] | undefined) {
  const results = useQueries({
    queries: (organizations ?? []).map((org) => memberRoleQuery(auth, org.id)),
  })
  const roles = new Map<string, string>()
  ;(organizations ?? []).forEach((org, index) => {
    const role = results[index]?.data
    if (role !== undefined) roles.set(org.id, role)
  })
  return roles
}

/** Make `organizationId` the session's active organization. Always passes the id explicitly. */
export function useSetActiveOrganization(auth: WebAuth) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (organizationId: string) => auth.setActiveOrganization(organizationId),
    onSuccess: () => invalidateSession(queryClient),
  })
}

export function useSignOut(auth: WebAuth) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => auth.signOut(),
    // Nothing from the signed-in session may stay cached for the next person on this browser.
    onSettled: () => queryClient.clear(),
  })
}

export function invalidateSession(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: qk.session() })
}

const RANK: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 }

/**
 * A membership's role string ("owner", "admin,member") as the picker's label. The highest role
 * wins. A role we don't know yet is shown as Viewer: the least it can be, and the server still
 * decides what the person may do.
 */
export function orgRoleLabel(role: string | undefined): OrgRole {
  if (!role) return "Viewer"
  const best = role
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .reduce<string | undefined>(
      (top, part) =>
        RANK[part] !== undefined && (!top || RANK[part] > (RANK[top] ?? 0)) ? part : top,
      undefined,
    )
  switch (best) {
    case "owner":
      return "Owner"
    case "admin":
      return "Admin"
    case "member":
      return "Member"
    default:
      return "Viewer"
  }
}

export function toOrgSummaries(
  organizations: WebOrganization[],
  roles: Map<string, string>,
): OrgSummary[] {
  return organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    role: orgRoleLabel(roles.get(org.id)),
  }))
}

/** The session's active organization, if it is one of the caller's. */
export function activeOrganization(
  session: WebSession | null | undefined,
  organizations: WebOrganization[] | undefined,
): WebOrganization | undefined {
  const id = session?.activeOrganizationId
  if (!id) return undefined
  return organizations?.find((org) => org.id === id)
}
