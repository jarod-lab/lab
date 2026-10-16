import { createFileRoute, redirect } from "@tanstack/react-router"

// /:org/settings has no page of its own: it lands on General.
export const Route = createFileRoute("/$org/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/$org/settings/general", params: { org: params.org }, replace: true })
  },
})
