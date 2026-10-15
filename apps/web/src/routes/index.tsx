import { createFileRoute, redirect } from "@tanstack/react-router"

// "/" is the API's llms.txt negotiation, not a web page. The prerendered shell still needs a match.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/sign-in", search: { next: undefined } })
  },
})
