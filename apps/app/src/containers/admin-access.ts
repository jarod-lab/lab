import { useQuery } from "@tanstack/react-query"

import { type AdminApi, getAdminApi } from "../lib/admin-api"
import type { AdminAccess } from "../lib/admin-nav"
import { type FeatureFlagsApi, getFeatureFlagsApi } from "../lib/feature-flags-api"
import { type SupportApi, getSupportApi } from "../lib/support-api"
import { adminSessionQuery, isPlatformAdmin, operatorOrganizationQuery } from "./admin-data"
import { supportStaffQuery } from "./support-data"

export interface AdminAccessApis {
  admin: AdminApi
  flags: FeatureFlagsApi
  /** Whether the person is support staff (the Support tab). Left out, nobody is. */
  support?: SupportApi
}

// Stands in when no support api is given; its query never runs.
const NO_SUPPORT: SupportApi = {
  isStaff: async () => false,
  listStaff: async () => [],
  queueAccess: async () => "not-staff",
}

/**
 * What the signed-in person may open in the admin console: Users as a platform admin, Feature flags
 * as a member of the operator organization, and Support as support staff there. `pending` until
 * every answer is in.
 */
export function useAdminAccess(
  apis: AdminAccessApis = {
    admin: getAdminApi(),
    flags: getFeatureFlagsApi(),
    support: getSupportApi(),
  },
): { access: AdminAccess; pending: boolean } {
  const session = useQuery(adminSessionQuery(apis.admin))
  const operator = useQuery(operatorOrganizationQuery(apis.flags))
  const operatorOrganizationId = operator.data ?? null
  // Only the operator organization's members can be support staff: nobody else is asked.
  const staff = useQuery({
    ...supportStaffQuery(apis.support ?? NO_SUPPORT, operatorOrganizationId ?? ""),
    enabled: apis.support !== undefined && operatorOrganizationId !== null,
  })
  return {
    access: {
      platformAdmin: isPlatformAdmin(session.data),
      operatorOrganizationId,
      supportStaff: staff.data === true,
    },
    pending:
      session.isPending || operator.isPending || (staff.isPending && staff.fetchStatus !== "idle"),
  }
}
