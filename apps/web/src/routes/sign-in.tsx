import { createFileRoute, useLocation } from "@tanstack/react-router"

import { SignInPage } from "../pages/auth-pages"
import { safeNext } from "../lib/navigation"
import { getWebAuth } from "../lib/web-auth"

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignInRoute,
})

function SignInRoute() {
  const { next } = Route.useSearch()
  // The OAuth query (client_id, sig, ...) must survive the trip to sign-up and back.
  const searchStr = useLocation({ select: (location) => location.searchStr })
  return (
    <SignInPage auth={getWebAuth()} next={safeNext(next)} signUpHref={`/sign-up${searchStr}`} />
  )
}
