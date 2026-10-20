import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  adminSessionQuery,
  isPlatformAdmin,
  operatorOrganizationQuery,
} from "../../containers/admin-data"
import { getAdminApi } from "../../lib/admin-api"
import { adminLanding } from "../../lib/admin-nav"
import { getFeatureFlagsApi } from "../../lib/feature-flags-api"

// /admin has no page of its own: it lands on the first tab this person may open.
export const Route = createFileRoute("/admin/")({
  beforeLoad: async ({ context }) => {
    if (typeof window === "undefined") return
    const [session, operatorOrganizationId] = await Promise.all([
      context.queryClient.ensureQueryData(adminSessionQuery(getAdminApi())),
      context.queryClient.ensureQueryData(operatorOrganizationQuery(getFeatureFlagsApi())),
    ])
    const to = adminLanding({ platformAdmin: isPlatformAdmin(session), operatorOrganizationId })
    throw redirect({ href: to, replace: true })
  },
})
