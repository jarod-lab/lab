import { createFileRoute } from "@tanstack/react-router"

import { getAccountApi } from "../lib/account-api"
import { safeNext } from "../lib/navigation"
import { getWebAuth } from "../lib/web-auth"
import { TwoFactorPage } from "../pages/two-factor-page"

const text = (value: unknown) => (typeof value === "string" ? value : undefined)

// The second step of a password sign-in or of an emailed link. The sign-in's query is kept on the way
// here (`next` is where the person was going). A link's callbackURL is the authorization it was headed to.
export const Route = createFileRoute("/two-factor")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: text(search.next),
    callbackURL: text(search.callbackURL),
  }),
  component: TwoFactorRoute,
})

function TwoFactorRoute() {
  const { next, callbackURL } = Route.useSearch()
  return (
    <TwoFactorPage
      next={safeNext(next)}
      callbackURL={callbackURL}
      signIn={getAccountApi()}
      continueOAuth={() => getWebAuth().continueOAuth()}
    />
  )
}
