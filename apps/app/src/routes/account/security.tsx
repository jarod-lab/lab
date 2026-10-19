import { createFileRoute } from "@tanstack/react-router"

import { AccountSecurityContainer } from "../../containers/account-security"
import { RouterLink } from "../../containers/router-link"
import { getAccountApi } from "../../lib/account-api"
import { getWebAuth } from "../../lib/web-auth"

export const Route = createFileRoute("/account/security")({
  component: AccountSecurityRoute,
})

function AccountSecurityRoute() {
  return (
    <AccountSecurityContainer api={getAccountApi()} auth={getWebAuth()} renderLink={RouterLink} />
  )
}
