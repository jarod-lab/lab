import { createFileRoute } from "@tanstack/react-router"

import { rawSearch, safeNext } from "../lib/navigation"
import { SignUpPage } from "../pages/auth-pages"
import { getWebAuth } from "../lib/web-auth"

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { next } = Route.useSearch()
  return (
    <SignUpPage auth={getWebAuth()} next={safeNext(next)} signInHref={`/sign-in${rawSearch()}`} />
  )
}
