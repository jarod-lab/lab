import { createFileRoute } from "@tanstack/react-router"

import { rawSearch, safeNext } from "../lib/navigation"
import { SignInPage } from "../pages/auth-pages"
import { getWebAuth } from "../lib/web-auth"

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignInRoute,
})

function SignInRoute() {
  const { next } = Route.useSearch()
  // The OAuth query (client_id, sig, repeated ba_param, ...) must reach sign-up unchanged.
  return (
    <SignInPage auth={getWebAuth()} next={safeNext(next)} signUpHref={`/sign-up${rawSearch()}`} />
  )
}
