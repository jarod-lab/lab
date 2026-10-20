import { Outlet, createFileRoute, useRouter, useRouterState } from "@tanstack/react-router"

import { AppShellContainer } from "../containers/app-shell"
import { adminCrumbs } from "../lib/admin-nav"
import { requireSession } from "../lib/guards"
import { getWebAuth } from "../lib/web-auth"

// The admin console (/admin/*), for the people who run the product, in the app shell. Signed-out
// visitors go to sign-in and come back here. Each tab answers "Not available" to anyone it isn't for.
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context, location }) => {
    if (typeof window === "undefined") return
    await requireSession(context.queryClient, getWebAuth(), location.href)
  },
  component: AdminLayout,
})

function AdminLayout() {
  const auth = getWebAuth()
  const router = useRouter()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <AppShellContainer
      auth={auth}
      slug={null}
      activeNav="admin"
      crumbs={adminCrumbs(pathname)}
      onNavigate={(href) => void router.navigate({ href })}
      onSignedOut={() => void router.navigate({ href: "/sign-in", replace: true })}
    >
      <Outlet />
    </AppShellContainer>
  )
}
