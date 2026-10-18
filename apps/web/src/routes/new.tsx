import { createFileRoute, useRouter } from "@tanstack/react-router"

import { AppShellContainer } from "../containers/app-shell"
import { CreateOrganizationContainer } from "../containers/create-organization"
import { requireSession } from "../lib/guards"
import { getWebAuth } from "../lib/web-auth"

export const Route = createFileRoute("/new")({
  beforeLoad: async ({ context, location }) => {
    if (typeof window === "undefined") return
    await requireSession(context.queryClient, getWebAuth(), location.href)
  },
  component: NewOrganizationRoute,
})

function NewOrganizationRoute() {
  const auth = getWebAuth()
  const router = useRouter()
  return (
    <AppShellContainer
      auth={auth}
      slug={null}
      crumbs={[{ label: "Create organization" }]}
      onNavigate={(href) => void router.navigate({ href })}
      onSignedOut={() => void router.navigate({ href: "/sign-in", replace: true })}
    >
      <CreateOrganizationContainer
        auth={auth}
        host={window.location.host}
        onCreated={(organization) => void router.navigate({ href: `/${organization.slug}` })}
        onCancel={() => void router.navigate({ href: "/" })}
      />
    </AppShellContainer>
  )
}
