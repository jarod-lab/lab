import { createFileRoute, redirect } from "@tanstack/react-router"

import { activeOrganization, organizationsQuery } from "../containers/shell-data"
import { requireSession } from "../lib/guards"
import { getWebAuth } from "../lib/web-auth"

// "/" is the API's llms.txt negotiation for non-browser clients. In the browser (client navigation
// and vite dev) a signed-in person goes to their active organization, and anyone else to sign-in.
// Never a full-page navigation target: the API answers `/` with a redirect to /llms.txt.
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    // The prerendered shell has no session to check.
    if (typeof window === "undefined")
      throw redirect({ to: "/sign-in", search: { next: undefined } })
    const auth = getWebAuth()
    const session = await requireSession(context.queryClient, auth)
    const organizations = await context.queryClient.ensureQueryData(organizationsQuery(auth))
    const active = activeOrganization(session, organizations) ?? organizations[0]
    if (!active) throw redirect({ to: "/new" })
    throw redirect({ to: "/$org", params: { org: active.slug } })
  },
})
