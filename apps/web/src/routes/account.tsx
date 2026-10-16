import { Outlet, createFileRoute, useRouter } from "@tanstack/react-router"

import { AppShellContainer } from "../containers/app-shell"
import { requireSession } from "../lib/guards"
import { getWebAuth } from "../lib/web-auth"

// The account pages (profile, security) share the organization shell. They show the active org.
export const Route = createFileRoute("/account")({
  beforeLoad: async ({ context, location }) => {
    if (typeof window === "undefined") return
    await requireSession(context.queryClient, getWebAuth(), location.href)
  },
  component: AccountLayout,
})

function AccountLayout() {
  const auth = getWebAuth()
  const router = useRouter()
  return (
    <AppShellContainer
      auth={auth}
      slug={null}
      crumbs={[{ label: "Account" }]}
      onNavigate={(href) => void router.navigate({ href })}
      onSignedOut={() => void router.navigate({ href: "/sign-in", replace: true })}
    >
      <Outlet />
    </AppShellContainer>
  )
}
