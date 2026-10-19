import { createFileRoute } from "@tanstack/react-router"

import { PasskeyLandingContainer } from "../containers/passkey-landing"
import { safeNext } from "../lib/navigation"
import { getWebAuth } from "../lib/web-auth"

// The emailed sign-up link lands here, signed in: it adds the passkey (lib/passkey-signup.ts).
export const Route = createFileRoute("/sign-up_/passkey")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
    // A refused link comes back here with its code (passkey-signup.ts), not signed in.
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: PasskeyLandingRoute,
})

function PasskeyLandingRoute() {
  const { next, error } = Route.useSearch()
  return (
    <PasskeyLandingContainer
      auth={getWebAuth()}
      next={safeNext(next)}
      signUpHref="/sign-up"
      linkError={error ?? null}
    />
  )
}
