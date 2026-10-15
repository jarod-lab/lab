import { createFileRoute } from "@tanstack/react-router"

import { PasswordPage } from "../pages/password-page"
import { getWebAuth } from "../lib/web-auth"

const text = (value: unknown) => (typeof value === "string" ? value : undefined)

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: text(search.token),
    error: text(search.error),
  }),
  component: ResetPasswordRoute,
})

function ResetPasswordRoute() {
  const { token, error } = Route.useSearch()
  return <PasswordPage auth={getWebAuth()} mode="reset" token={token} linkError={error} />
}
