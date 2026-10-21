import { useQuery } from "@tanstack/react-query"

import { type AdminApi, getAdminApi } from "../lib/admin-api"
import type { AdminAccess } from "../lib/admin-nav"
import { type FeatureFlagsApi, getFeatureFlagsApi } from "../lib/feature-flags-api"
import { adminSessionQuery, isPlatformAdmin, operatorOrganizationQuery } from "./admin-data"

export interface AdminAccessApis {
  admin: AdminApi
  flags: FeatureFlagsApi
}

/**
 * What the signed-in person may open in the admin console: Users as a platform admin, Feature flags
 * as a member of the operator organization. `pending` until both answers are in.
 */
export function useAdminAccess(
  apis: AdminAccessApis = { admin: getAdminApi(), flags: getFeatureFlagsApi() },
): { access: AdminAccess; pending: boolean } {
  const session = useQuery(adminSessionQuery(apis.admin))
  const operator = useQuery(operatorOrganizationQuery(apis.flags))
  return {
    access: {
      platformAdmin: isPlatformAdmin(session.data),
      operatorOrganizationId: operator.data ?? null,
    },
    pending: session.isPending || operator.isPending,
  }
}
