import { createFileRoute, redirect } from "@tanstack/react-router"

import { activeOrganization, organizationsQuery } from "../../containers/shell-data"
import { requireSession } from "../../lib/guards"
import { getWebAuth } from "../../lib/web-auth"

// The agents page moved under the organization (/:org/settings/agents). This keeps old links working.
export const Route = createFileRoute("/settings/agents")({
  beforeLoad: async ({ context }) => {
    if (typeof window === "undefined") return
    const auth = getWebAuth()
    const session = await requireSession(context.queryClient, auth, "/settings/agents")
    const organizations = await context.queryClient.ensureQueryData(organizationsQuery(auth))
    const active = activeOrganization(session, organizations) ?? organizations[0]
    if (!active) throw redirect({ to: "/new" })
    throw redirect({ to: "/$org/settings/agents", params: { org: active.slug } })
  },
})
