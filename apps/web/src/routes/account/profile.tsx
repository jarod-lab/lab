import { createFileRoute } from "@tanstack/react-router"

import { AccountProfileContainer } from "../../containers/account-profile"
import { RouterLink } from "../../containers/router-link"
import { getAccountApi } from "../../lib/account-api"
import { getOrgSettingsApi } from "../../lib/org-settings-api"
import { getUploadsApi } from "../../lib/uploads-api"
import { getWebAuth } from "../../lib/web-auth"

export const Route = createFileRoute("/account/profile")({
  component: AccountProfileRoute,
})

function AccountProfileRoute() {
  return (
    <AccountProfileContainer
      auth={getWebAuth()}
      api={getAccountApi()}
      orgApi={getOrgSettingsApi()}
      uploads={getUploadsApi()}
      renderLink={RouterLink}
    />
  )
}
