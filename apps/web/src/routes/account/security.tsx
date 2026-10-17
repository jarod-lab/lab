import { createFileRoute } from "@tanstack/react-router"

import { AccountSecurityContainer } from "../../containers/account-security"
import { RouterLink } from "../../containers/router-link"
import { getAccountApi } from "../../lib/account-api"

export const Route = createFileRoute("/account/security")({
  component: AccountSecurityRoute,
})

function AccountSecurityRoute() {
  return <AccountSecurityContainer api={getAccountApi()} renderLink={RouterLink} />
}
