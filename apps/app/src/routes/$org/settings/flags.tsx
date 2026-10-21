import { createFileRoute, redirect } from "@tanstack/react-router"

// Feature flags moved to the admin console; old links land there.
export const Route = createFileRoute("/$org/settings/flags")({
  beforeLoad: () => {
    throw redirect({ href: "/admin/flags", replace: true })
  },
})
