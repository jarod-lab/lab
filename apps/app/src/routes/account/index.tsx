import { createFileRoute, redirect } from "@tanstack/react-router"

// /account has no page of its own: it lands on the profile.
export const Route = createFileRoute("/account/")({
  beforeLoad: () => {
    throw redirect({ to: "/account/profile", replace: true })
  },
})
