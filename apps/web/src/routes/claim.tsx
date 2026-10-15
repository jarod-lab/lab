import { createFileRoute } from "@tanstack/react-router"

import { PasswordPage } from "../pages/password-page"
import { getWebAuth } from "../lib/web-auth"

const text = (value: unknown) => (typeof value === "string" ? value : undefined)

// The claim email for an account an agent created links here with a reset token.
export const Route = createFileRoute("/claim")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: text(search.token),
    error: text(search.error),
  }),
  component: ClaimRoute,
})

function ClaimRoute() {
  const { token, error } = Route.useSearch()
  return <PasswordPage auth={getWebAuth()} mode="claim" token={token} linkError={error} />
}
