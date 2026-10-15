import { createFileRoute, useLocation } from "@tanstack/react-router"

import { SignUpPage } from "../pages/auth-pages"
import { safeNext } from "../lib/navigation"
import { getWebAuth } from "../lib/web-auth"

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { next } = Route.useSearch()
  const searchStr = useLocation({ select: (location) => location.searchStr })
  return (
    <SignUpPage auth={getWebAuth()} next={safeNext(next)} signInHref={`/sign-in${searchStr}`} />
  )
}
